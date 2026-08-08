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
import { DEFAULT_SETTINGS, storage, uid } from '@/lib/storage';
import type {
  Customer,
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
      const [loadedSettings, loadedItems, loadedCustomers, cachedQuotes, cachedHistory] =
        await Promise.all([
          storage.loadSettings(),
          storage.loadItems(),
          storage.loadCustomers(),
          storage.loadQuotes(),
          storage.loadHistory(),
        ]);
      if (cancelled) return;

      setSettings(loadedSettings);
      settingsRef.current = loadedSettings;
      setItems(loadedItems);
      setCustomers(loadedCustomers);
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
      resetAll,
    }),
    [
      ready,
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
