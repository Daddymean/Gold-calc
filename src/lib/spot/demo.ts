import type { CurrencyCode } from '@/lib/format';
import type { HistoryRange, MetalSymbol, PricePoint, SpotQuote } from '@/types';

/**
 * Offline price source.
 *
 * The app ships usable without an API key so it can be demoed on a counter or
 * run on a dead connection. Prices are a seeded random walk anchored to
 * realistic levels — they are NOT market data, and every screen that shows them
 * is labelled "demo" so nobody pays out against a made-up number.
 */

const ANCHOR: Record<MetalSymbol, number> = {
  XAU: 2380,
  XAG: 28.4,
  XPT: 985,
  XPD: 1010,
};

/** Annualised volatility used to shape the walk, roughly matching each metal. */
const VOL: Record<MetalSymbol, number> = {
  XAU: 0.13,
  XAG: 0.28,
  XPT: 0.22,
  XPD: 0.34,
};

/** Rough FX multipliers off USD, so the demo respects the currency toggle. */
const FX: Record<CurrencyCode, number> = {
  USD: 1,
  CAD: 1.36,
  GBP: 0.79,
  EUR: 0.92,
  AUD: 1.52,
  INR: 83.4,
};

/** Deterministic hash → [0,1). Same day always yields the same price. */
function seeded(seed: number): number {
  let x = Math.sin(seed) * 10000;
  x -= Math.floor(x);
  return x;
}

function dayIndex(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

function metalSeed(metal: MetalSymbol): number {
  return metal.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 97;
}

/** Price for a given metal on a given day, stable across calls. */
function priceOnDay(metal: MetalSymbol, day: number): number {
  const anchor = ANCHOR[metal];
  const dailyVol = VOL[metal] / Math.sqrt(252);
  const base = metalSeed(metal);

  // Sum a short deterministic walk so consecutive days are correlated rather
  // than independent noise, which would make the chart look like static.
  let drift = 0;
  for (let i = 0; i < 60; i++) {
    drift += (seeded(base + (day - i) * 1.37) - 0.5) * dailyVol * (1 - i / 90);
  }
  const seasonal = Math.sin(day / 47) * 0.03 + Math.sin(day / 211) * 0.06;
  return anchor * (1 + drift + seasonal);
}

const RANGE_DAYS: Record<HistoryRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  '5y': 1825,
};

export function demoQuote(metal: MetalSymbol, currency: CurrencyCode): SpotQuote {
  const today = dayIndex(new Date());
  const fx = FX[currency] ?? 1;
  const price = priceOnDay(metal, today) * fx;
  const previousClose = priceOnDay(metal, today - 1) * fx;
  const change = price - previousClose;

  return {
    metal,
    price,
    currency,
    change,
    changePercent: previousClose ? change / previousClose : 0,
    previousClose,
    high24h: Math.max(price, previousClose) * 1.004,
    low24h: Math.min(price, previousClose) * 0.996,
    fetchedAt: new Date().toISOString(),
  };
}

export function demoHistory(
  metal: MetalSymbol,
  currency: CurrencyCode,
  range: HistoryRange,
): PricePoint[] {
  const days = RANGE_DAYS[range];
  const today = dayIndex(new Date());
  const fx = FX[currency] ?? 1;

  // Long ranges get thinned so a 5y chart carries ~180 points, not 1825.
  const step = Math.max(1, Math.round(days / 180));
  const points: PricePoint[] = [];

  for (let i = days; i >= 0; i -= step) {
    const day = today - i;
    points.push({
      date: new Date(day * 86_400_000).toISOString().slice(0, 10),
      price: priceOnDay(metal, day) * fx,
    });
  }
  return points;
}
