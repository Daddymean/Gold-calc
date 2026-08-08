import { calculateMelt, findPurity, METAL_ORDER, type MetalSymbol } from '@/lib/metals';
import type { InventoryItem } from '@/types';

export interface ItemValuation {
  /** Melt value of the item at the current spot price. */
  meltNow: number;
  /** meltNow − purchasePrice, or salePrice − purchasePrice once sold. */
  gain: number;
  gainPercent: number;
  pureGrams: number;
  /** False when we have no spot price for this item's metal. */
  priced: boolean;
}

export function valueItem(
  item: InventoryItem,
  spot: Partial<Record<MetalSymbol, number>>,
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
  const marketValue =
    item.isNumismatic && item.numismaticValue ? item.numismaticValue : result.meltValue;

  // Once sold, the gain is realised and fixed — current spot no longer moves it.
  const exitValue = item.status === 'sold' && item.salePrice != null ? item.salePrice : marketValue;
  const gain = exitValue - item.purchasePrice;

  return {
    meltNow: marketValue,
    gain,
    gainPercent: item.purchasePrice > 0 ? gain / item.purchasePrice : 0,
    pureGrams: result.pureGrams,
    priced: spotPrice != null,
  };
}

export interface PortfolioSummary {
  /** Items still on the shelf. */
  heldCount: number;
  /** What was paid for everything still held. */
  costBasis: number;
  /** What everything still held is worth right now. */
  marketValue: number;
  unrealisedGain: number;
  unrealisedPercent: number;
  /** Profit already banked on sold items. */
  realisedGain: number;
  pureGramsByMetal: Record<MetalSymbol, number>;
  /** Market value split by metal, for the composition bar. */
  valueByMetal: Record<MetalSymbol, number>;
  /** Any item whose metal has no current quote — the totals are incomplete. */
  unpricedCount: number;
}

export function summarisePortfolio(
  items: InventoryItem[],
  spot: Partial<Record<MetalSymbol, number>>,
): PortfolioSummary {
  const summary: PortfolioSummary = {
    heldCount: 0,
    costBasis: 0,
    marketValue: 0,
    unrealisedGain: 0,
    unrealisedPercent: 0,
    realisedGain: 0,
    pureGramsByMetal: { XAU: 0, XAG: 0, XPT: 0, XPD: 0 },
    valueByMetal: { XAU: 0, XAG: 0, XPT: 0, XPD: 0 },
    unpricedCount: 0,
  };

  for (const item of items) {
    const valuation = valueItem(item, spot);

    if (item.status === 'sold') {
      summary.realisedGain += valuation.gain;
      continue;
    }
    // Melted stock has left the book as an item; its value moved to refining.
    if (item.status === 'melted') continue;

    summary.heldCount += 1;
    summary.costBasis += item.purchasePrice;
    summary.marketValue += valuation.meltNow;
    summary.pureGramsByMetal[item.metal] += valuation.pureGrams;
    summary.valueByMetal[item.metal] += valuation.meltNow;
    if (!valuation.priced) summary.unpricedCount += 1;
  }

  summary.unrealisedGain = summary.marketValue - summary.costBasis;
  summary.unrealisedPercent =
    summary.costBasis > 0 ? summary.unrealisedGain / summary.costBasis : 0;

  return summary;
}

/** Metals present in the book, heaviest first — drives the composition bar order. */
export function metalsPresent(summary: PortfolioSummary): MetalSymbol[] {
  return METAL_ORDER.filter((m) => summary.valueByMetal[m] > 0);
}
