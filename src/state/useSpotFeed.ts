import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { getProvider, type ProviderId } from '@/lib/spot';
import { storage } from '@/lib/storage';
import type {
  HistoryRange,
  MetalSymbol,
  PriceHistory,
  Settings,
  SpotQuote,
} from '@/types';

/**
 * The live-price half of app state: current quotes, their provenance, and the
 * cached history series behind the charts.
 *
 * Split from the book (items, customers, lots) because the two share nothing
 * but the settings object — prices arrive on a timer from the network, the
 * book changes when an operator touches it, and neither needs to know the
 * other exists. Keeping them in one 700-line provider meant every reader of
 * either had to scroll past the other.
 */

export const historyKey = (metal: MetalSymbol, range: HistoryRange, currency: string) =>
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

export interface SpotFeed {
  quotes: Record<MetalSymbol, SpotQuote | undefined>;
  quotesUpdatedAt: string | null;
  refreshing: boolean;
  spotError: string | null;
  refreshQuotes: (force?: boolean) => Promise<void>;
  history: Record<string, PriceHistory>;
  loadHistory: (metal: MetalSymbol, range: HistoryRange) => Promise<PriceHistory | null>;
  historyLoading: boolean;
  /** Seeds quotes and history from the on-device cache at bootstrap. */
  hydrate: (cachedQuotes: SpotQuote[], cachedHistory: Record<string, PriceHistory>) => void;
  /** Drops every cached price. Called when currency or provider changes. */
  invalidate: () => Promise<void>;
  /** Returns to the empty state. Part of "erase everything". */
  reset: () => void;
}

/**
 * `settingsRef` rather than `settings` for the fetch paths: the refresh timer
 * and the app-foreground handler must always read current settings without
 * being torn down and rebuilt on every keystroke in the settings screen.
 */
export function useSpotFeed(settings: Settings, settingsRef: { current: Settings }, ready: boolean): SpotFeed {
  const [quotes, setQuotes] = useState<Record<MetalSymbol, SpotQuote | undefined>>(
    indexQuotes([]),
  );
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [spotError, setSpotError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, PriceHistory>>({});
  const [historyLoading, setHistoryLoading] = useState(false);

  const lastFetchRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  // Mirrors `history` so loadHistory's failure fallback can read the current
  // cache without the callback's identity changing on every fetch.
  const historyRef = useRef(history);
  historyRef.current = history;

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
    } catch (err) {
      // Never clear the cached quotes on failure — an offline counter still
      // needs the last good numbers, clearly marked as stale.
      setSpotError((err as Error)?.message ?? 'Could not reach the price feed');
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, [settingsRef]);

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
        return historyRef.current[key] ?? null;
      } finally {
        setHistoryLoading(false);
      }
    },
    [settingsRef],
  );

  const hydrate = useCallback(
    (cachedQuotes: SpotQuote[], cachedHistory: Record<string, PriceHistory>) => {
      // Merge rather than replace: a screen can mount and fetch its own series
      // before the cache read resolves, and a plain assignment would throw
      // that fresher data away. Anything already in state wins over the cache.
      setHistory((prev) => ({ ...cachedHistory, ...prev }));
      // Show the last known prices immediately; the network refresh replaces
      // them a moment later. Stale numbers beat an empty ticker.
      if (cachedQuotes.length) {
        setQuotes(indexQuotes(cachedQuotes));
        setQuotesUpdatedAt(cachedQuotes[0]?.fetchedAt ?? null);
      }
    },
    [],
  );

  const invalidate = useCallback(async () => {
    lastFetchRef.current = 0;
    setHistory({});
    await storage.saveHistory({});
  }, []);

  const reset = useCallback(() => {
    setHistory({});
    setQuotes(indexQuotes([]));
    setQuotesUpdatedAt(null);
    lastFetchRef.current = 0;
  }, []);

  return {
    quotes,
    quotesUpdatedAt,
    refreshing,
    spotError,
    refreshQuotes,
    history,
    loadHistory,
    historyLoading,
    hydrate,
    invalidate,
    reset,
  };
}
