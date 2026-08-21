import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_SETTINGS, VaultUnreadableError, storage, uid } from '@/lib/storage';
import { resolveOffer, type RateQuery, type ResolvedOffer } from '@/lib/buyTable';
import { deleteAllPhotos, deletePhoto } from '@/lib/photos';
import { expiredIdPhotoOwners } from '@/lib/retention';
import { METAL_ORDER } from '@/lib/metals';
import {
  activeLotItemIds,
  calculateExpectedContent,
  NO_FEES,
  type AssayLine,
  type LotFees,
} from '@/lib/refining';
import { buildDemoBook } from '@/lib/demo';
import { IS_DEMO } from '@/lib/demoMode';
import { useSpotFeed } from '@/state/useSpotFeed';
import { useStoredCollection } from '@/state/useStoredCollection';
import type {
  BuyRule,
  Customer,
  MeltLot,
  HistoryRange,
  InventoryItem,
  MetalSymbol,
  PriceHistory,
  Settings,
  SpotQuote,
} from '@/types';

/**
 * The book: inventory, customers, lots, buy rules, settings — everything an
 * operator writes. Live prices moved to `useSpotFeed`; they arrive on a timer
 * from the network and share nothing with the book except the settings object.
 *
 * Each collection persists through `useStoredCollection`, which is where the
 * two storage guarantees live: mutations apply to the current state rather
 * than a render-stale copy, and writes are serialized so an older payload can
 * never land after a newer one.
 */

interface AppStateValue {
  ready: boolean;
  /**
   * Set when stored data exists but could not be decrypted. The app must not
   * render an empty book in this state — that invites the operator to save over
   * records that are still there, just unreadable.
   */
  vaultError: string | null;

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  items: InventoryItem[];
  addItem: (draft: Omit<InventoryItem, 'id' | 'ticket' | 'createdAt' | 'updatedAt'>) => Promise<InventoryItem>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  getItem: (id: string) => InventoryItem | undefined;

  customers: Customer[];
  addCustomer: (draft: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Customer>;
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  getCustomer: (id: string) => Customer | undefined;

  quotes: Record<MetalSymbol, SpotQuote | undefined>;
  quotesUpdatedAt: string | null;
  refreshing: boolean;
  spotError: string | null;
  refreshQuotes: (force?: boolean) => Promise<void>;

  history: Record<string, PriceHistory>;
  loadHistory: (metal: MetalSymbol, range: HistoryRange) => Promise<PriceHistory | null>;
  historyLoading: boolean;

  lots: MeltLot[];
  getLot: (id: string) => MeltLot | undefined;
  createLot: (itemIds: string[], refinerName: string) => Promise<MeltLot>;
  updateLot: (id: string, patch: Partial<MeltLot>) => Promise<void>;
  deleteLot: (id: string) => Promise<void>;
  /** Moves a lot to 'sent' and marks its items melted in one step. */
  sendLot: (id: string) => Promise<void>;
  /**
   * `actualPayout` is the net the refiner reported paying, when the operator has
   * the figure rather than a full statement. It takes precedence over the assay
   * arithmetic; undefined means settle from the lines.
   */
  settleLot: (
    id: string,
    assayLines: AssayLine[],
    fees: LotFees,
    actualPayout?: number,
  ) => Promise<void>;

  buyRules: BuyRule[];
  saveBuyRules: (rules: BuyRule[]) => Promise<void>;
  /**
   * Resolves what to pay for a piece, honouring the useBuyTable setting.
   * Needs the melt value and gross weight because a rule may price either as a
   * percentage of melt or as a posted per-gram rate.
   */
  offerFor: (query: RateQuery, meltValue: number, grossGrams: number) => ResolvedOffer;

  resetAll: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

// Module-level so the write queues behind each collection are created once.
const saveItems = (value: InventoryItem[]) => storage.saveItems(value);
const saveCustomers = (value: Customer[]) => storage.saveCustomers(value);
const saveLots = (value: MeltLot[]) => storage.saveLots(value);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [buyRules, setBuyRules] = useState<BuyRule[]>([]);
  const [vaultError, setVaultError] = useState<string | null>(null);

  // Destructured because the hook returns a fresh wrapper object each render;
  // the functions inside are the stable identities the callbacks below key on.
  const {
    state: items,
    hydrate: hydrateItems,
    read: readItems,
    commit: commitItems,
  } = useStoredCollection<InventoryItem>(saveItems);
  const {
    state: customers,
    hydrate: hydrateCustomers,
    read: readCustomers,
    commit: commitCustomers,
  } = useStoredCollection<Customer>(saveCustomers);
  const {
    state: lots,
    hydrate: hydrateLots,
    read: readLots,
    commit: commitLots,
  } = useStoredCollection<MeltLot>(saveLots);

  // Kept in a ref so the refresh timer and app-foreground handler always read
  // current settings without being torn down and rebuilt on every keystroke.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const spot = useSpotFeed(settings, settingsRef, ready);
  const { invalidate: invalidateSpot, reset: resetSpot } = spot;

  /* ------------------------------------------------------------- bootstrap */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loadedSettings: Settings;
      let loadedItems: InventoryItem[];
      let loadedCustomers: Customer[];
      let loadedRules: BuyRule[];
      let loadedLots: MeltLot[];
      let cachedQuotes: SpotQuote[];
      let cachedHistory: Record<string, PriceHistory>;

      try {
        [
          loadedSettings,
          loadedItems,
          loadedCustomers,
          loadedRules,
          loadedLots,
          cachedQuotes,
          cachedHistory,
        ] = await Promise.all([
            storage.loadSettings(),
            storage.loadItems(),
            storage.loadCustomers(),
            storage.loadBuyRules(),
            storage.loadLots(),
            storage.loadQuotes(),
            storage.loadHistory(),
          ]);
      } catch (err) {
        if (cancelled) return;
        // Stop here rather than booting into an empty book. Storage has already
        // latched writes off, so nothing can overwrite the records we failed to
        // open; the UI shows what happened and offers the two real options.
        setVaultError(
          err instanceof VaultUnreadableError
            ? 'Your book is encrypted with a key this device no longer has. It may have come from a backup restored without its keychain.'
            : ((err as Error)?.message ?? 'Stored data could not be opened.'),
        );
        setReady(true);
        return;
      }

      if (cancelled) return;

      // The public demo seeds a sample book on a first visit so a prospect sees
      // a working counter rather than an empty app. Only ever when the book is
      // genuinely empty, so a visitor's own edits are never overwritten.
      if (IS_DEMO && !loadedItems.length && !loadedCustomers.length) {
        const seeded = buildDemoBook(uid);
        loadedItems = seeded.items;
        loadedCustomers = seeded.customers;
        loadedRules = seeded.buyRules;
        // References come from the same counter the app uses, so a visitor's
        // first lot is L-0002 rather than a second L-0001.
        loadedLots = [];
        for (const lot of seeded.lots) {
          loadedLots.push({ ...lot, reference: await storage.nextLotReference() });
        }
        await Promise.all([
          storage.saveItems(loadedItems),
          storage.saveCustomers(loadedCustomers),
          storage.saveBuyRules(loadedRules),
          storage.saveLots(loadedLots),
        ]);
      }

      setSettings(loadedSettings);
      settingsRef.current = loadedSettings;
      hydrateItems(loadedItems);
      hydrateCustomers(loadedCustomers);
      setBuyRules(loadedRules);
      hydrateLots(loadedLots);
      spot.hydrate(cachedQuotes, cachedHistory);
      setReady(true);

      // Retention sweep: drop ID images that have outlived the window the
      // operator configured. Runs after the book is on screen so a slow
      // filesystem never delays the first paint.
      const expired = expiredIdPhotoOwners(loadedCustomers, loadedSettings.idPhotoRetentionDays);
      if (expired.length) {
        await Promise.all(
          loadedCustomers
            .filter((c) => expired.includes(c.id) && c.idPhotoUri)
            .map((c) => deletePhoto(c.idPhotoUri!)),
        );
        if (cancelled) return;
        await commitCustomers((prev) =>
          prev.map((customer) =>
            expired.includes(customer.id)
              ? { ...customer, idPhotoUri: undefined, updatedAt: new Date().toISOString() }
              : customer,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // Bootstrap runs exactly once; everything it calls is identity-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------- inventory */

  const addItem: AppStateValue['addItem'] = useCallback(
    async (draft) => {
      const now = new Date().toISOString();
      const item: InventoryItem = {
        ...draft,
        id: uid(),
        ticket: await storage.nextTicket(),
        createdAt: now,
        updatedAt: now,
      };
      await commitItems((prev) => [item, ...prev]);
      return item;
    },
    [commitItems],
  );

  const updateItem: AppStateValue['updateItem'] = useCallback(
    async (id, patch) => {
      await commitItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, ...patch, updatedAt: new Date().toISOString() } : it,
        ),
      );
    },
    [commitItems],
  );

  // Deleting a record deletes its images too. This belongs here rather than in
  // whichever screen happened to call it: a photo outliving the record it
  // documents is a leak no second caller should be able to reintroduce.
  const deleteItem: AppStateValue['deleteItem'] = useCallback(
    async (id) => {
      const doomed = readItems().find((it) => it.id === id);
      await commitItems((prev) => prev.filter((it) => it.id !== id));
      if (doomed) await Promise.all(doomed.photoUris.map(deletePhoto));
    },
    [readItems, commitItems],
  );

  /* ------------------------------------------------------------- customers */

  const addCustomer: AppStateValue['addCustomer'] = useCallback(
    async (draft) => {
      const now = new Date().toISOString();
      const customer: Customer = { ...draft, id: uid(), createdAt: now, updatedAt: now };
      await commitCustomers((prev) => [customer, ...prev]);
      return customer;
    },
    [commitCustomers],
  );

  const updateCustomer: AppStateValue['updateCustomer'] = useCallback(
    async (id, patch) => {
      const before = readCustomers().find((c) => c.id === id);
      await commitCustomers((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
        ),
      );
      // Swapping in a new ID photo must not strand the old one on disk.
      if (
        before?.idPhotoUri &&
        'idPhotoUri' in patch &&
        patch.idPhotoUri !== before.idPhotoUri
      ) {
        await deletePhoto(before.idPhotoUri);
      }
    },
    [readCustomers, commitCustomers],
  );

  const deleteCustomer: AppStateValue['deleteCustomer'] = useCallback(
    async (id) => {
      const doomed = readCustomers().find((c) => c.id === id);
      await commitCustomers((prev) => prev.filter((c) => c.id !== id));
      // The ID photo is the most sensitive file the app writes. Retention only
      // sweeps images that have aged out; deleting the person's record has to
      // take theirs with it, or it stays in the sandbox with nothing in the UI
      // that can reach it.
      if (doomed?.idPhotoUri) await deletePhoto(doomed.idPhotoUri);
    },
    [readCustomers, commitCustomers],
  );

  /* ------------------------------------------------------------ melt lots */

  const createLot: AppStateValue['createLot'] = useCallback(
    async (itemIds, refinerName) => {
      // An item must not sit in two unsettled lots: both could be sent and
      // settled, and the same purchase price would be counted against two
      // different refining results, inventing profit that never existed.
      const reserved = activeLotItemIds(readLots());
      const free = itemIds.filter((itemId) => !reserved.has(itemId));
      if (!free.length) {
        throw new Error('Every item chosen is already in another open lot.');
      }

      const chosen = readItems().filter((item) => free.includes(item.id));
      const lot: MeltLot = {
        id: uid(),
        reference: await storage.nextLotReference(),
        refinerName: refinerName.trim(),
        itemIds: free,
        status: 'open',
        // Frozen now: the lot's profit must be measured against what these
        // items actually cost, even if an item is edited or deleted later.
        costBasis: calculateExpectedContent(chosen).costBasis,
        currency: settingsRef.current.currency,
        assayLines: [],
        fees: { ...NO_FEES },
        createdAt: new Date().toISOString(),
      };
      await commitLots((prev) => [lot, ...prev]);
      return lot;
    },
    [readItems, readLots, commitLots],
  );

  const updateLot: AppStateValue['updateLot'] = useCallback(
    async (id, patch) => {
      await commitLots((prev) =>
        prev.map((lot) => (lot.id === id ? { ...lot, ...patch } : lot)),
      );
    },
    [commitLots],
  );

  const deleteLot: AppStateValue['deleteLot'] = useCallback(
    async (id) => {
      const lot = readLots().find((l) => l.id === id);
      await commitLots((prev) => prev.filter((l) => l.id !== id));
      // Deleting a lot that was already sent puts its items back on the shelf,
      // rather than leaving them marked melted with nothing to account for them.
      if (lot && lot.status !== 'open') {
        await commitItems((prev) =>
          prev.map((item) =>
            lot.itemIds.includes(item.id) && item.status === 'melted'
              ? { ...item, status: 'in_stock', updatedAt: new Date().toISOString() }
              : item,
          ),
        );
      }
    },
    [readLots, commitItems, commitLots],
  );

  const sendLot: AppStateValue['sendLot'] = useCallback(
    async (id) => {
      const lot = readLots().find((l) => l.id === id);
      if (!lot) return;
      const now = new Date().toISOString();

      // Recompute the basis at send time: the lot's contents can change while
      // it is still open, and this is the moment it stops being editable.
      const chosen = readItems().filter((item) => lot.itemIds.includes(item.id));
      await commitLots((prev) =>
        prev.map((l) =>
          l.id === id
            ? { ...l, status: 'sent', sentAt: now, costBasis: calculateExpectedContent(chosen).costBasis }
            : l,
        ),
      );
      await commitItems((prev) =>
        prev.map((item) =>
          lot.itemIds.includes(item.id) ? { ...item, status: 'melted', updatedAt: now } : item,
        ),
      );
    },
    [readItems, readLots, commitItems, commitLots],
  );

  const settleLot: AppStateValue['settleLot'] = useCallback(
    async (id, assayLines, fees, actualPayout) => {
      await commitLots((prev) =>
        prev.map((lot) =>
          lot.id === id
            ? {
                ...lot,
                status: 'settled',
                assayLines,
                fees,
                actualPayout,
                settledAt: new Date().toISOString(),
              }
            : lot,
        ),
      );
    },
    [commitLots],
  );

  /* ----------------------------------------------------- rules & settings */

  const saveBuyRules: AppStateValue['saveBuyRules'] = useCallback(async (rules) => {
    setBuyRules(rules);
    await storage.saveBuyRules(rules);
  }, []);

  // Reads settings directly rather than through the ref: a screen memoising on
  // offerFor must recompute when the toggle or the default rate changes, and a
  // ref read would leave it quoting the old number.
  const offerFor: AppStateValue['offerFor'] = useCallback(
    (query, meltValue, grossGrams) =>
      // Turning the table off behaves exactly as if it were empty, so the
      // toggle never leaves a stale rule quietly influencing a quote.
      resolveOffer(
        settings.useBuyTable ? buyRules : [],
        query,
        meltValue,
        grossGrams,
        settings.defaultPayoutRate,
        settings.currency,
      ),
    [buyRules, settings.useBuyTable, settings.defaultPayoutRate, settings.currency],
  );

  const updateSettings: AppStateValue['updateSettings'] = useCallback(
    async (patch) => {
      const next = { ...settingsRef.current, ...patch };
      setSettings(next);
      settingsRef.current = next;
      await storage.saveSettings(next);
      // Changing currency or provider invalidates every cached price.
      if (patch.currency || patch.spotProvider || patch.spotApiKey) {
        await invalidateSpot();
      }
    },
    [invalidateSpot],
  );

  const resetAll = useCallback(async () => {
    // Photos first: they are plain files, so destroying the key in clearAll()
    // does nothing to them. "Erase everything" has to mean it.
    await deleteAllPhotos();
    await storage.clearAll();
    setVaultError(null);
    setBuyRules([]);
    hydrateItems([]);
    hydrateCustomers([]);
    hydrateLots([]);
    setSettings(DEFAULT_SETTINGS);
    settingsRef.current = DEFAULT_SETTINGS;
    resetSpot();
  }, [hydrateItems, hydrateCustomers, hydrateLots, resetSpot]);

  /* ----------------------------------------------------------------- value */

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      vaultError,
      settings,
      updateSettings,
      items,
      addItem,
      updateItem,
      deleteItem,
      getItem: (id) => items.find((i) => i.id === id),
      customers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      getCustomer: (id) => customers.find((c) => c.id === id),
      quotes: spot.quotes,
      quotesUpdatedAt: spot.quotesUpdatedAt,
      refreshing: spot.refreshing,
      spotError: spot.spotError,
      refreshQuotes: spot.refreshQuotes,
      history: spot.history,
      loadHistory: spot.loadHistory,
      historyLoading: spot.historyLoading,
      lots,
      getLot: (id) => lots.find((l) => l.id === id),
      createLot,
      updateLot,
      deleteLot,
      sendLot,
      settleLot,
      buyRules,
      saveBuyRules,
      offerFor,
      resetAll,
    }),
    [
      ready,
      vaultError,
      settings,
      updateSettings,
      items,
      addItem,
      updateItem,
      deleteItem,
      customers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      spot.quotes,
      spot.quotesUpdatedAt,
      spot.refreshing,
      spot.spotError,
      spot.refreshQuotes,
      spot.history,
      spot.loadHistory,
      spot.historyLoading,
      lots,
      createLot,
      updateLot,
      deleteLot,
      sendLot,
      settleLot,
      buyRules,
      saveBuyRules,
      offerFor,
      resetAll,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}

/** Convenience for screens that only need the four spot prices. */
export function useSpot(): Partial<Record<MetalSymbol, number>> {
  const { quotes } = useApp();
  return useMemo(() => {
    const out: Partial<Record<MetalSymbol, number>> = {};
    for (const m of METAL_ORDER) out[m] = quotes[m]?.price;
    return out;
  }, [quotes]);
}
