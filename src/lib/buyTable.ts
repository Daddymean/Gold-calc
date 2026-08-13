// Relative rather than the '@/' alias on purpose: this module is exercised by
// the node test runner, which does not resolve the bundler's path alias.
import { findPurity, toGrams, type MetalSymbol, type WeightUnit } from './metals.ts';
import type { CurrencyCode } from './format.ts';

/**
 * The buy table.
 *
 * Almost nobody pays a single flat percentage of melt. Real shops run a matrix:
 * a rate per karat, stepped by how much the customer brought, because a 200 g
 * lot earns a better number than a single broken earring. This encodes that
 * matrix and resolves the right rate for a given piece.
 *
 * Pure and dependency-free, like the melt engine, so the calculator and the
 * intake form resolve rates identically and it can be tested in plain node.
 */

/**
 * How a rule prices a piece.
 *
 * `percent` floats with spot automatically. `perGram` is a posted price — the
 * board behind the counter says "14K: $42/g" — which is simpler for staff to
 * read out but goes stale as spot moves, so the calculator always shows the
 * percentage of melt a posted price currently works out to.
 */
export type RateMode = 'percent' | 'perGram';

export interface BuyRule {
  id: string;
  metal: MetalSymbol;
  /** A specific purity id, or null for "any purity of this metal". */
  purityId: string | null;
  /** Inclusive lower bound of the weight band, in grams. */
  minGrams: number;
  /** Exclusive upper bound, or null for "and up". */
  maxGrams: number | null;
  /**
   * Pricing basis. Optional for rules written before per-gram pricing existed;
   * absent means 'percent'.
   */
  mode?: RateMode;
  /** Fraction of melt paid out, 0–1. Used when mode is 'percent'. */
  rate: number;
  /**
   * Currency per gram of the item *as presented* — per gram of 14K, not per
   * gram of pure gold, because that is how a counter posts it. Used when mode
   * is 'perGram'.
   */
  perGram?: number;
  /**
   * Currency a posted per-gram price was entered in. A percentage rule needs
   * none — it is a ratio — but a bare 42 means nothing without knowing whether
   * it was dollars or euros, and the app lets the display currency change.
   */
  currency?: CurrencyCode;
  label?: string;
}

export function ruleMode(rule: BuyRule): RateMode {
  return rule.mode ?? 'percent';
}

export interface ResolvedRate {
  rate: number;
  /** The rule that won, or null when nothing matched. */
  rule: BuyRule | null;
  /** Human-readable explanation for the calculator: "14K · 10–50 g". */
  reason: string;
}

export interface RateQuery {
  metal: MetalSymbol;
  purityId: string;
  weight: number;
  unit: WeightUnit;
  quantity?: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function bandLabel(rule: BuyRule): string {
  const from = `${rule.minGrams}`;
  if (rule.maxGrams == null) return `${from} g+`;
  return `${from}–${rule.maxGrams} g`;
}

function matches(rule: BuyRule, metal: MetalSymbol, purityId: string, grams: number): boolean {
  if (rule.metal !== metal) return false;
  if (rule.purityId !== null && rule.purityId !== purityId) return false;
  if (grams < rule.minGrams) return false;
  if (rule.maxGrams != null && grams >= rule.maxGrams) return false;
  return true;
}

/**
 * Picks the rate for a piece.
 *
 * Specificity wins: a rule naming the exact karat beats a metal-wide rule, and
 * among equally specific matches the narrowest weight band wins. That lets a
 * user set "all gold: 75%" once and then carve out "18K over 50 g: 85%"
 * without the general rule swallowing the exception.
 */
export function resolveRate(
  rules: BuyRule[],
  query: RateQuery,
  fallbackRate: number,
): ResolvedRate {
  const quantity = query.quantity && query.quantity > 0 ? query.quantity : 1;
  const grams = toGrams(Math.max(0, query.weight), query.unit) * quantity;

  const candidates = rules.filter((rule) => matches(rule, query.metal, query.purityId, grams));

  if (!candidates.length) {
    return {
      rate: clamp01(fallbackRate),
      rule: null,
      reason: rules.length ? 'No table rule matches — using your default rate' : 'Default rate',
    };
  }

  candidates.sort((a, b) => {
    // Exact purity beats "any purity".
    const aExact = a.purityId !== null ? 1 : 0;
    const bExact = b.purityId !== null ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    // Then the tighter weight band. An open-ended band is the widest possible.
    const aSpan = a.maxGrams == null ? Number.POSITIVE_INFINITY : a.maxGrams - a.minGrams;
    const bSpan = b.maxGrams == null ? Number.POSITIVE_INFINITY : b.maxGrams - b.minGrams;
    if (aSpan !== bSpan) return aSpan - bSpan;

    // Still tied: the higher minimum is the more specific carve-out.
    return b.minGrams - a.minGrams;
  });

  const winner = candidates[0];
  const purityLabel = winner.purityId ? (findPurity(winner.purityId)?.label ?? '') : 'All';
  return {
    rate: clamp01(winner.rate),
    rule: winner,
    reason: winner.label || `${purityLabel} · ${bandLabel(winner)}`,
  };
}

export interface ResolvedOffer {
  /** What to hand the customer. */
  payout: number;
  /** payout ÷ melt value — what a posted per-gram price is actually costing. */
  impliedRate: number;
  /** payout ÷ gross grams, the number read aloud at the counter. */
  perGram: number;
  mode: RateMode;
  rule: BuyRule | null;
  reason: string;
  /**
   * True when a posted per-gram price has drifted far enough from spot to be
   * worth revisiting — either giving metal away or pricing nobody would accept.
   */
  stale: boolean;
  /**
   * True when a posted price was entered in a different currency than the one
   * now displayed. The price is NOT used in that case — 42 euros is not 42
   * dollars, and quietly treating it as such would misprice the offer.
   */
  currencyMismatch: boolean;
}

/** A posted price this far from the table's own percent norms deserves a flag. */
const STALE_LOW = 0.55;
const STALE_HIGH = 0.98;

/**
 * Turns the matched rule into an actual offer.
 *
 * Both bases end up in the same three numbers — a total, a per-gram rate and a
 * percentage of melt — so a buyer pricing off a posted board and a buyer
 * pricing off spot can read the same panel.
 */
export function resolveOffer(
  rules: BuyRule[],
  query: RateQuery,
  meltValue: number,
  grossGrams: number,
  fallbackRate: number,
  /** The currency the offer will be paid in. Omit to skip the check. */
  currency?: CurrencyCode,
): ResolvedOffer {
  const resolved = resolveRate(rules, query, fallbackRate);
  const rule = resolved.rule;
  const declaredMode = rule ? ruleMode(rule) : 'percent';

  // A posted price carries a currency; a percentage does not. If the display
  // currency has moved on, refuse the posted number rather than reinterpreting
  // it — falling back to the percentage default is wrong by a margin, whereas
  // treating euros as dollars is wrong by the exchange rate.
  const currencyMismatch =
    declaredMode === 'perGram' &&
    !!currency &&
    !!rule?.currency &&
    rule.currency !== currency;

  const mode: RateMode = currencyMismatch ? 'percent' : declaredMode;

  const payout =
    mode === 'perGram' && rule
      ? Math.max(0, rule.perGram ?? 0) * Math.max(0, grossGrams)
      : meltValue * (currencyMismatch ? Math.min(1, Math.max(0, fallbackRate)) : resolved.rate);

  const impliedRate = meltValue > 0 ? payout / meltValue : 0;

  return {
    payout,
    impliedRate,
    perGram: grossGrams > 0 ? payout / grossGrams : 0,
    mode,
    rule,
    reason: currencyMismatch
      ? `Posted price is in ${rule?.currency} — using your default rate instead`
      : resolved.reason,
    // Only meaningful for posted prices; a percentage rule cannot drift.
    stale:
      mode === 'perGram' &&
      meltValue > 0 &&
      (impliedRate < STALE_LOW || impliedRate > STALE_HIGH),
    currencyMismatch,
  };
}

/** Rules for one metal, ordered the way the editor should list them. */
export function rulesForMetal(rules: BuyRule[], metal: MetalSymbol): BuyRule[] {
  return rules
    .filter((rule) => rule.metal === metal)
    .sort((a, b) => {
      if (a.purityId !== b.purityId) {
        if (a.purityId === null) return -1;
        if (b.purityId === null) return 1;
        return a.purityId.localeCompare(b.purityId);
      }
      return a.minGrams - b.minGrams;
    });
}

/**
 * Flags bands that overlap within the same metal and purity. Overlaps are not
 * an error — resolveRate always picks one deterministically — but they are
 * usually a typo, and the editor should say so.
 */
export function findOverlaps(rules: BuyRule[]): [BuyRule, BuyRule][] {
  const clashes: [BuyRule, BuyRule][] = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (a.metal !== b.metal || a.purityId !== b.purityId) continue;
      const aMax = a.maxGrams ?? Number.POSITIVE_INFINITY;
      const bMax = b.maxGrams ?? Number.POSITIVE_INFINITY;
      if (a.minGrams < bMax && b.minGrams < aMax) clashes.push([a, b]);
    }
  }
  return clashes;
}

/**
 * A starter table for someone opening the editor for the first time. The bands
 * mirror how scrap counters usually step: a base rate, better over an ounce,
 * better again over a quarter kilo.
 */
export function starterRules(makeId: () => string): BuyRule[] {
  const bands: [number, number | null, number][] = [
    [0, 31.1, 0.72],
    [31.1, 250, 0.8],
    [250, null, 0.86],
  ];

  const rules: BuyRule[] = [];
  for (const [minGrams, maxGrams, rate] of bands) {
    rules.push({ id: makeId(), metal: 'XAU', purityId: null, minGrams, maxGrams, rate });
  }
  // Silver moves on volume, so its base is lower and its steps are larger.
  const silverBands: [number, number | null, number][] = [
    [0, 500, 0.6],
    [500, null, 0.72],
  ];
  for (const [minGrams, maxGrams, rate] of silverBands) {
    rules.push({ id: makeId(), metal: 'XAG', purityId: null, minGrams, maxGrams, rate });
  }
  rules.push({ id: makeId(), metal: 'XPT', purityId: null, minGrams: 0, maxGrams: null, rate: 0.7 });
  rules.push({ id: makeId(), metal: 'XPD', purityId: null, minGrams: 0, maxGrams: null, rate: 0.7 });
  return rules;
}
