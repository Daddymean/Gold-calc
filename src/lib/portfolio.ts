// Relative with an explicit extension: this module is exercised by the node
// test runner, which does not resolve the bundler's '@/' alias. Type-only
// imports are erased before Node sees them, so those may keep the alias.
import { calculateMelt, findPurity, METAL_ORDER, zeroByMetal, type MetalSymbol } from './metals.ts';
import { calculateSettlement, type LotFees, type AssayLine, type LotStatus } from './refining.ts';
import type { CurrencyCode } from '@/lib/format';
import type { InventoryItem } from '@/types';

/**
 * Valuation, and the one rule that governs it.
 *
 * Two kinds of number live on an item and they do not mix:
 *
 *   - **Recorded money** — purchase price, sale price — is in `item.currency`,
 *     stamped when the record was written and never restated.
 *   - **Derived value** — melt at today's spot — is in whatever currency the
 *     price feed is currently quoting, i.e. the display currency.
 *
 * They are the same unit only while the shop's currency has not changed. A book
 * that took a deal in EUR and now displays USD holds costs in one unit and
 * market values in another, and subtracting them produces a confident, wrong
 * answer. So cost and gain are aggregated over matching-currency items only,
 * and the count of the rest is reported rather than buried. Physical quantities
 * — grams — and spot-derived market values are always valid, because neither
 * depends on what the item cost.
 *
 * Converting instead would need an FX rate for the date of each purchase, which
 * the app does not have. Declining to add the numbers is the honest option.
 */

export interface ItemValuation {
  /** Melt value at the current spot price, in the display currency. */
  meltNow: number;
  /** meltNow − purchasePrice, or salePrice − purchasePrice once sold. Zero when not comparable. */
  gain: number;
  gainPercent: number;
  pureGrams: number;
  /** False when we have no spot price for this item's metal. */
  priced: boolean;
  /**
   * False when the item was recorded in a different currency from the one on
   * screen. `meltNow` is still right; `gain` is not, and is zeroed.
   */
  comparable: boolean;
}

export function valueItem(
  item: InventoryItem,
  spot: Partial<Record<MetalSymbol, number>>,
  displayCurrency: CurrencyCode,
): ItemValuation {
  const purity = findPurity(item.purityId);
  const spotPrice = spot[item.metal];

  const result = calculateMelt({
    spotPerTroyOz: spotPrice ?? 0,
    weight: item.weight,
    unit: item.unit,
    fineness: purity?.fineness ?? 0,
    payoutRate: 1,
    quantity: item.quantity,
  });

  // A graded coin is worth its numismatic price, not its melt. Valuing it at
  // melt would understate the book, so the collector value wins when set.
  //
  // Unlike melt, a numismatic value is money the operator typed, so it is in
  // the item's own currency — only usable here when that matches the display.
  const comparable = item.currency === displayCurrency;
  const marketValue =
    item.isNumismatic && item.numismaticValue && comparable
      ? item.numismaticValue
      : result.meltValue;

  // Once sold, the gain is realised and fixed — current spot no longer moves it.
  const exitValue = item.status === 'sold' && item.salePrice != null ? item.salePrice : marketValue;
  const gain = comparable ? exitValue - item.purchasePrice : 0;

  return {
    meltNow: marketValue,
    gain,
    gainPercent: comparable && item.purchasePrice > 0 ? gain / item.purchasePrice : 0,
    pureGrams: result.pureGrams,
    priced: spotPrice != null,
    comparable,
  };
}

export interface PortfolioSummary {
  /** Items still on the shelf, whatever currency they were bought in. */
  heldCount: number;
  /** What was paid for held items recorded in the display currency. */
  costBasis: number;
  /** What everything still held is worth right now — spot-derived, so complete. */
  marketValue: number;
  unrealisedGain: number;
  unrealisedPercent: number;
  /**
   * Profit already banked, in the display currency: sales plus settled refining
   * lots. Scrap is the larger half of most dealers' realised profit, and a
   * figure that counted only shop sales would understate the year.
   */
  realisedGain: number;
  /** The sales half of `realisedGain`. */
  realisedFromSales: number;
  /**
   * The refining half. Only settled lots count — until the refiner reports
   * there is no number, and guessing one would flatter the book.
   */
  realisedFromRefining: number;
  /** Settled lots left out of the total because they were priced in another currency. */
  offCurrencyLots: number;
  pureGramsByMetal: Record<MetalSymbol, number>;
  /** Market value split by metal, for the composition bar. */
  valueByMetal: Record<MetalSymbol, number>;
  /** Any item whose metal has no current quote — the totals are incomplete. */
  unpricedCount: number;
  /**
   * Held items recorded in another currency. Their metal is counted in the
   * weights and the market value; their cost is not, so `costBasis` and
   * `unrealisedGain` exclude them.
   */
  offCurrencyHeld: number;
  /** Sold items recorded in another currency, excluded from `realisedGain`. */
  offCurrencySold: number;
  /**
   * True when there is no cost to compare against — either the book is empty
   * or everything in it was bought in a different currency. The gain figures
   * are zero because they are unknown, not because the book is flat, and the
   * caller must not present them as a result.
   */
  gainUnavailable: boolean;
}

/** The part of a melt lot this roll-up needs. */
export interface SummaryLot {
  status: LotStatus;
  assayLines: AssayLine[];
  fees: LotFees;
  costBasis: number;
  actualPayout?: number;
  currency: CurrencyCode;
}

export function summarisePortfolio(
  items: InventoryItem[],
  spot: Partial<Record<MetalSymbol, number>>,
  displayCurrency: CurrencyCode,
  lots: SummaryLot[],
): PortfolioSummary {
  const summary: PortfolioSummary = {
    heldCount: 0,
    costBasis: 0,
    marketValue: 0,
    unrealisedGain: 0,
    unrealisedPercent: 0,
    realisedGain: 0,
    realisedFromSales: 0,
    realisedFromRefining: 0,
    offCurrencyLots: 0,
    pureGramsByMetal: zeroByMetal(),
    valueByMetal: zeroByMetal(),
    unpricedCount: 0,
    offCurrencyHeld: 0,
    offCurrencySold: 0,
    gainUnavailable: false,
  };

  // Market value of the held items whose cost is also counted. The unrealised
  // gain is the difference between these two, never against the full market
  // value — that would credit off-currency stock with a gain from no cost.
  let comparableMarketValue = 0;

  for (const item of items) {
    const valuation = valueItem(item, spot, displayCurrency);

    if (item.status === 'sold') {
      if (!valuation.comparable) summary.offCurrencySold += 1;
      summary.realisedFromSales += valuation.gain;
      continue;
    }
    // Melted stock has left the book as an item; its value moved to refining.
    if (item.status === 'melted') continue;

    summary.heldCount += 1;
    summary.marketValue += valuation.meltNow;
    summary.pureGramsByMetal[item.metal] += valuation.pureGrams;
    summary.valueByMetal[item.metal] += valuation.meltNow;
    if (!valuation.priced) summary.unpricedCount += 1;

    if (valuation.comparable) {
      summary.costBasis += item.purchasePrice;
      comparableMarketValue += valuation.meltNow;
    } else {
      summary.offCurrencyHeld += 1;
    }
  }

  // Scrap that has been sent, assayed and paid for is realised profit as surely
  // as a sale over the counter. Melted items were skipped above precisely
  // because their outcome lives here instead.
  for (const lot of lots) {
    if (lot.status !== 'settled') continue;
    if (lot.currency !== displayCurrency) {
      summary.offCurrencyLots += 1;
      continue;
    }
    summary.realisedFromRefining += calculateSettlement(lot).profit;
  }
  summary.realisedGain = summary.realisedFromSales + summary.realisedFromRefining;

  summary.unrealisedGain = comparableMarketValue - summary.costBasis;
  summary.unrealisedPercent =
    summary.costBasis > 0 ? summary.unrealisedGain / summary.costBasis : 0;
  // Nothing to measure against. Zero here means "unknown", and a screen that
  // draws it as a flat green delta would be making a claim about the book.
  summary.gainUnavailable = summary.costBasis === 0 && summary.heldCount > 0;

  return summary;
}

/** Metals present in the book, heaviest first — drives the composition bar order. */
export function metalsPresent(summary: PortfolioSummary): MetalSymbol[] {
  return METAL_ORDER.filter((m) => summary.valueByMetal[m] > 0);
}
