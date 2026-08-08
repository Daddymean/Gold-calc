import type { CurrencyCode } from '@/lib/format';
import { METAL_ORDER } from '@/lib/metals';
import type { HistoryRange, MetalSymbol, PriceHistory, PricePoint, SpotQuote } from '@/types';
import { demoHistory, demoQuote } from './demo';

/**
 * Live pricing.
 *
 * Two real providers are wired up plus the offline demo source. Both real ones
 * are free-tier friendly and quote per troy ounce, which is what the engine
 * wants. Adding a third means implementing `SpotProvider` and registering it —
 * nothing else in the app needs to know.
 *
 *   metals.dev  https://metals.dev        latest + timeseries, key required
 *   goldapi.io  https://www.goldapi.io    latest only, key required
 */

export type ProviderId = 'demo' | 'metals.dev' | 'goldapi';

export interface SpotProvider {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  supportsHistory: boolean;
  fetchQuotes(currency: CurrencyCode, apiKey: string): Promise<SpotQuote[]>;
  fetchHistory(
    metal: MetalSymbol,
    currency: CurrencyCode,
    range: HistoryRange,
    apiKey: string,
  ): Promise<PricePoint[]>;
}

const RANGE_DAYS: Record<HistoryRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  '5y': 1825,
};

const REQUEST_TIMEOUT_MS = 12_000;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText || 'request failed'}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------- demo */

const demoProvider: SpotProvider = {
  id: 'demo',
  label: 'Demo (offline)',
  requiresKey: false,
  supportsHistory: true,
  async fetchQuotes(currency) {
    return METAL_ORDER.map((m) => demoQuote(m, currency));
  },
  async fetchHistory(metal, currency, range) {
    return demoHistory(metal, currency, range);
  },
};

/* -------------------------------------------------------------- metals.dev */

const METALS_DEV_KEY: Record<MetalSymbol, string> = {
  XAU: 'gold',
  XAG: 'silver',
  XPT: 'platinum',
  XPD: 'palladium',
};

const metalsDevProvider: SpotProvider = {
  id: 'metals.dev',
  label: 'metals.dev',
  requiresKey: true,
  supportsHistory: true,

  async fetchQuotes(currency, apiKey) {
    const url =
      `https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(apiKey)}` +
      `&currency=${currency}&unit=toz`;
    const data = await getJson(url);
    if (data?.status && data.status !== 'success') {
      throw new Error(data.error_message || data.error_code || 'metals.dev rejected the request');
    }

    const now = new Date().toISOString();
    return METAL_ORDER.map((metal) => {
      const price = Number(data?.metals?.[METALS_DEV_KEY[metal]]);
      if (!Number.isFinite(price)) return null;
      // The latest endpoint has no previous close, so change is filled in by
      // the cache layer, which remembers the last value it saw.
      return {
        metal,
        price,
        currency,
        change: 0,
        changePercent: 0,
        previousClose: price,
        fetchedAt: now,
      } satisfies SpotQuote;
    }).filter((q): q is SpotQuote => q !== null);
  },

  async fetchHistory(metal, currency, range, apiKey) {
    const url =
      `https://api.metals.dev/v1/timeseries?api_key=${encodeURIComponent(apiKey)}` +
      `&start_date=${isoDaysAgo(RANGE_DAYS[range])}&end_date=${isoDaysAgo(0)}` +
      `&currency=${currency}&unit=toz`;
    const data = await getJson(url);
    if (data?.status && data.status !== 'success') {
      throw new Error(data.error_message || 'metals.dev rejected the request');
    }

    const key = METALS_DEV_KEY[metal];
    const points: PricePoint[] = Object.entries(data?.rates ?? {})
      .map(([date, value]: [string, any]) => ({
        date,
        price: Number(value?.metals?.[key]),
      }))
      .filter((p) => Number.isFinite(p.price))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!points.length) throw new Error('No history returned for this range');
    return points;
  },
};

/* ---------------------------------------------------------------- goldapi */

const goldApiProvider: SpotProvider = {
  id: 'goldapi',
  label: 'GoldAPI.io',
  requiresKey: true,
  supportsHistory: false,

  async fetchQuotes(currency, apiKey) {
    const results = await Promise.allSettled(
      METAL_ORDER.map(async (metal): Promise<SpotQuote> => {
        const data = await getJson(`https://www.goldapi.io/api/${metal}/${currency}`, {
          'x-access-token': apiKey,
          'Content-Type': 'application/json',
        });
        const price = Number(data?.price);
        if (!Number.isFinite(price)) throw new Error(`No price for ${metal}`);
        const previousClose = Number(data?.prev_close_price) || price;
        return {
          metal,
          price,
          currency,
          change: Number(data?.ch) || price - previousClose,
          changePercent: Number.isFinite(Number(data?.chp))
            ? Number(data.chp) / 100
            : previousClose
              ? (price - previousClose) / previousClose
              : 0,
          previousClose,
          high24h: Number(data?.high_price) || undefined,
          low24h: Number(data?.low_price) || undefined,
          fetchedAt: new Date().toISOString(),
        };
      }),
    );

    const quotes = results
      .filter((r): r is PromiseFulfilledResult<SpotQuote> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (!quotes.length) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      throw new Error(first?.reason?.message ?? 'GoldAPI returned no prices');
    }
    return quotes;
  },

  async fetchHistory(metal, currency, range) {
    // GoldAPI's history is a paid add-on; fall back rather than fail the screen.
    return demoHistory(metal, currency, range);
  },
};

export const PROVIDERS: Record<ProviderId, SpotProvider> = {
  demo: demoProvider,
  'metals.dev': metalsDevProvider,
  goldapi: goldApiProvider,
};

export function getProvider(id: ProviderId): SpotProvider {
  return PROVIDERS[id] ?? demoProvider;
}

export function buildHistory(
  metal: MetalSymbol,
  currency: CurrencyCode,
  range: HistoryRange,
  points: PricePoint[],
): PriceHistory {
  return { metal, currency, range, points, fetchedAt: new Date().toISOString() };
}

/** Percent change across a series — the number under a trend chart. */
export function seriesChange(points: PricePoint[]): { absolute: number; percent: number } {
  if (points.length < 2) return { absolute: 0, percent: 0 };
  const first = points[0].price;
  const last = points[points.length - 1].price;
  return { absolute: last - first, percent: first ? (last - first) / first : 0 };
}
