import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import { getProvider, type ProviderId } from '@/lib/spot';
import { METAL_ORDER } from '@/lib/metals';
import { DEFAULT_SETTINGS, VaultUnreadableError, storage, uid } from '@/lib/storage';
import { resolveOffer, type RateQuery, type ResolvedOffer } from '@/lib/buyTable';
import { deletePhoto } from '@/lib/photos';
import { expiredIdPhotoOwners } from '@/lib/retention';
import {
  activeLotItemIds,
  calculateExpectedContent,
  NO_FEES,
  type AssayLine,
  type LotFees,
} from '@/lib/refining';
import { buildDemoBook } from '@/lib/demo';
import { IS_DEMO } from '@/lib/demoMode';
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
 * One provider holds inventory, customers, settings and spot prices. They are
 * genuinely coupled — logging an item stamps the live spot onto the record, and
 * the dashboard values inventory against the current quote — so splitting them
 * would just mean threading the same data through three contexts.
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
  settleLot: (id: string, assayLines: AssayLine[], fees: LotFees) => Promise<void>;

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

const historyKey = (metal: MetalSymbol, range: HistoryRange, currency: string) =>
  `${metal}:${range}:${currency}`;

function indexQuotes(list: SpotQuote[]): Record<MetalSymbol, SpotQuote | undefined> {
  const out: Record<MetalSymbol, SpotQuote | undefined> = {
    XAU: undefined,
    XAG: undefined,
    XPT: undefined,
    XPD: undefined,
  };
  for (const q of list) out[q.metal] = q;
  return out;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Record<MetalSymbol, SpotQuote | undefined>>(
    indexQuotes([]),
  );
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [spotError, setSpotError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, PriceHistory>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [buyRules, setBuyRules] = useState<BuyRule[]>([]);
  const [lots, setLots] = useState<MeltLot[]>([]);
  const [vaultError, setVaultError] = useState<string | null>(null);

  // Kept in a ref so the refresh timer and app-foreground handler always read
  // current settings without being torn down and rebuilt on every keystroke.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastFetchRef = useRef<number>(0);
  const inFlightRef = useRef(false);

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
        await Promise.all([
          storage.saveItems(seeded.items),
          storage.saveCustomers(seeded.customers),
          storage.saveBuyRules(seeded.buyRules),
        ]);
      }

      setSettings(loadedSettings);
      settingsRef.current = loadedSettings;
      setItems(loadedItems);
      setCustomers(loadedCustomers);
      setBuyRules(loadedRules);
      setLots(loadedLots);
      // Merge rather than replace: a screen can mount and fetch its own series
      // before these reads resolve, and a plain assignment would throw that
      // fresher data away. Anything already in state wins over the cache.
      setHistory((prev) => ({ ...cachedHistory, ...prev }));

      // Show the last known prices immediately; the network refresh replaces
      // them a moment later. Stale numbers beat an empty ticker.
      if (cachedQuotes.length) {
        setQuotes(indexQuotes(cachedQuotes));
        setQuotesUpdatedAt(cachedQuotes[0]?.fetchedAt ?? null);
      }
      setReady(true);

      // Retention sweep: drop ID images that have outlived the window the
      // operator configured. Runs after the book is on screen so a slow
      // filesystem never delays the first paint.
      const expired = expiredIdPhotoOwners(loadedCustomers, loadedSettings.idPhotoRetentionDays);
      if (expired.length) {
        const swept = loadedCustomers.map((customer) =>
          expired.includes(customer.id)
            ? { ...customer, idPhotoUri: undefined, updatedAt: new Date().toISOString() }
            : customer,
        );
        await Promise.all(
          loadedCustomers
            .filter((c) => expired.includes(c.id) && c.idPhotoUri)
            .map((c) => deletePhoto(c.idPhotoUri!)),
        );
        if (cancelled) return;
        setCustomers(swept);
        await storage.saveCustomers(swept);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ----------------------------------------------------------- spot prices */

  const refreshQuotes = useCallback(async (force = false) => {
    if (inFlightRef.current) return;
    const current = settingsRef.current;

    if (!force) {
      const staleAfter = Math.max(1, current.refreshMinutes) * 60_000;
      if (Date.now() - lastFetchRef.current < staleAfter) return;
    }

    inFlightRef.current = true;
    setRefreshing(true);
    try {
      const provider = getProvider(current.spotProvider as ProviderId);
      if (provider.requiresKey && !current.spotApiKey) {
        throw new Error(`${provider.label} needs an API key — add one in Settings.`);
      }

      const fetched = await provider.fetchQuotes(current.currency, current.spotApiKey);
      const previous = await storage.loadQuotes();

      // Providers that only return a spot price get their change column filled
      // from the last price this device saw, so the ticker still tells a story.
      const enriched = fetched.map((quote) => {
        if (quote.change !== 0 || quote.previousClose !== quote.price) return quote;
        const prior = previous.find((p) => p.metal === quote.metal && p.currency === quote.currency);
        if (!prior || !prior.price) return quote;
        const change = quote.price - prior.price;
        return {
          ...quote,
          change,
          changePercent: change / prior.price,
          previousClose: prior.price,
        };
      });

      setQuotes(indexQuotes(enriched));
      setQuotesUpdatedAt(new Date().toISOString());
      setSpotError(null);
      lastFetchRef.current = Date.now();
      await storage.saveQuotes(enriched);
    } catch (err: any) {
      // Never clear the cached quotes on failure — an offline counter still
      // needs the last good numbers, clearly marked as stale.
      setSpotError(err?.message ?? 'Could not reach the price feed');
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Initial fetch plus a poll on the configured interval.
  useEffect(() => {
    if (!ready) return;
    refreshQuotes(true);
    const ms = Math.max(1, settings.refreshMinutes) * 60_000;
    const timer = setInterval(() => refreshQuotes(false), ms);
    return () => clearInterval(timer);
  }, [ready, settings.refreshMinutes, settings.currency, settings.spotProvider, settings.spotApiKey, refreshQuotes]);

  // Prices go stale while the phone is in a pocket; catch up on foreground.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') refreshQuotes(false);
    });
    return () => sub.remove();
  }, [refreshQuotes]);

  /* --------------------------------------------------------------- history */

  const loadHistory = useCallback(
    async (metal: MetalSymbol, range: HistoryRange): Promise<PriceHistory | null> => {
      const current = settingsRef.current;
      const key = historyKey(metal, range, current.currency);
      setHistoryLoading(true);
      try {
        const provider = getProvider(current.spotProvider as ProviderId);
        const points = await provider.fetchHistory(metal, current.currency, range, current.spotApiKey);
        const entry: PriceHistory = {
          metal,
          currency: current.currency,
          range,
          points,
          fetchedAt: new Date().toISOString(),
        };
        setHistory((prev) => {
          const next = { ...prev, [key]: entry };
          storage.saveHistory(next);
          return next;
        });
        return entry;
      } catch {
        // Fall back to whatever this range last held rather than blanking the chart.
        return history[key] ?? null;
      } finally {
        setHistoryLoading(false);
      }
    },
    [history],
  );

  /* ------------------------------------------------------------- mutations */

  const persistItems = useCallback(async (next: InventoryItem[]) => {
    setItems(next);
    await storage.saveItems(next);
  }, []);

  const persistCustomers = useCallback(async (next: Customer[]) => {
    setCustomers(next);
    await storage.saveCustomers(next);
  }, []);

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
      await persistItems([item, ...items]);
      return item;
    },
    [items, persistItems],
  );

  const updateItem: AppStateValue['updateItem'] = useCallback(
    async (id, patch) => {
      await persistItems(
        items.map((it) =>
          it.id === id ? { ...it, ...patch, updatedAt: new Date().toISOString() } : it,
        ),
      );
    },
    [items, persistItems],
  );

  const deleteItem: AppStateValue['deleteItem'] = useCallback(
    async (id) => {
      await persistItems(items.filter((it) => it.id !== id));
    },
    [items, persistItems],
  );

  const addCustomer: AppStateValue['addCustomer'] = useCallback(
    async (draft) => {
      const now = new Date().toISOString();
      const customer: Customer = { ...draft, id: uid(), createdAt: now, updatedAt: now };
      await persistCustomers([customer, ...customers]);
      return customer;
    },
    [customers, persistCustomers],
  );

  const updateCustomer: AppStateValue['updateCustomer'] = useCallback(
    async (id, patch) => {
      await persistCustomers(
        customers.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
        ),
      );
    },
    [customers, persistCustomers],
  );

  const deleteCustomer: AppStateValue['deleteCustomer'] = useCallback(
    async (id) => {
      await persistCustomers(customers.filter((c) => c.id !== id));
    },
    [customers, persistCustomers],
  );

  /* ------------------------------------------------------------ melt lots */

  const persistLots = useCallback(async (next: MeltLot[]) => {
    setLots(next);
    await storage.saveLots(next);
  }, []);

  const createLot: AppStateValue['createLot'] = useCallback(
    async (itemIds, refinerName) => {
      // An item must not sit in two unsettled lots: both could be sent and
      // settled, and the same purchase price would be counted against two
      // different refining results, inventing profit that never existed.
      const reserved = activeLotItemIds(lots);
      const free = itemIds.filter((itemId) => !reserved.has(itemId));
      if (!free.length) {
        throw new Error('Every item chosen is already in another open lot.');
      }

      const chosen = items.filter((item) => free.includes(item.id));
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
      await persistLots([lot, ...lots]);
      return lot;
    },
    [items, lots, persistLots],
  );

  const updateLot: AppStateValue['updateLot'] = useCallback(
    async (id, patch) => {
      await persistLots(lots.map((lot) => (lot.id === id ? { ...lot, ...patch } : lot)));
    },
    [lots, persistLots],
  );

  const deleteLot: AppStateValue['deleteLot'] = useCallback(
    async (id) => {
      const lot = lots.find((l) => l.id === id);
      await persistLots(lots.filter((l) => l.id !== id));
      // Deleting a lot that was already sent puts its items back on the shelf,
      // rather than leaving them marked melted with nothing to account for them.
      if (lot && lot.status !== 'open') {
        await persistItems(
          items.map((item) =>
            lot.itemIds.includes(item.id) && item.status === 'melted'
              ? { ...item, status: 'in_stock', updatedAt: new Date().toISOString() }
              : item,
          ),
        );
      }
    },
    [lots, items, persistLots, persistItems],
  );

  const sendLot: AppStateValue['sendLot'] = useCallback(
    async (id) => {
      const lot = lots.find((l) => l.id === id);
      if (!lot) return;
      const now = new Date().toISOString();

      // Recompute the basis at send time: the lot's contents can change while
      // it is still open, and this is the moment it stops being editable.
      const chosen = items.filter((item) => lot.itemIds.includes(item.id));
      await persistLots(
        lots.map((l) =>
          l.id === id
            ? { ...l, status: 'sent', sentAt: now, costBasis: calculateExpectedContent(chosen).costBasis }
            : l,
        ),
      );
      await persistItems(
        items.map((item) =>
          lot.itemIds.includes(item.id) ? { ...item, status: 'melted', updatedAt: now } : item,
        ),
      );
    },
    [lots, items, persistLots, persistItems],
  );

  const settleLot: AppStateValue['settleLot'] = useCallback(
    async (id, assayLines, fees) => {
      await persistLots(
        lots.map((lot) =>
          lot.id === id
            ? { ...lot, status: 'settled', assayLines, fees, settledAt: new Date().toISOString() }
            : lot,
        ),
      );
    },
    [lots, persistLots],
  );

  const saveBuyRules: AppStateValue['saveBuyRules'] = useCallback(async (rules) => {
    setBuyRules(rules);
    await storage.saveBuyRules(rules);
  }, []);

  // Reads settings directly rather than through the ref: a screen memoising on
  // rateFor must recompute when the toggle or the default rate changes, and a
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
        lastFetchRef.current = 0;
        setHistory({});
        await storage.saveHistory({});
      }
    },
    [],
  );

  const resetAll = useCallback(async () => {
    await storage.clearAll();
    setVaultError(null);
    setBuyRules([]);
    setLots([]);
    setItems([]);
    setCustomers([]);
    setSettings(DEFAULT_SETTINGS);
    settingsRef.current = DEFAULT_SETTINGS;
    setHistory({});
    setQuotes(indexQuotes([]));
    lastFetchRef.current = 0;
  }, []);

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
      quotes,
      quotesUpdatedAt,
      refreshing,
      spotError,
      refreshQuotes,
      history,
      loadHistory,
      historyLoading,
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
      quotes,
      quotesUpdatedAt,
      refreshing,
      spotError,
      refreshQuotes,
      history,
      loadHistory,
      historyLoading,
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
