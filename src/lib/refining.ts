// Relative imports with an explicit extension: this module is exercised by the
// node test runner, which does not resolve the bundler's '@/' path alias.
import {
  TROY_OUNCE_IN_GRAMS,
  calculateMelt,
  findPurity,
  METAL_ORDER,
  zeroByMetal,
  type MetalSymbol,
  type WeightUnit,
} from './metals.ts';

/**
 * Refining lots and settlement.
 *
 * Scrap does not turn into money at the counter — it turns into money weeks
 * later, when a refiner reports what the lot actually assayed and pays a
 * percentage of that content. Everything before this file is an estimate; this
 * is where a dealer finds out whether the buy was any good.
 *
 * The settlement model is payable-percentage-of-assay: the refiner weighs the
 * lot, assays it to a fineness, and pays for an agreed fraction of the pure
 * content it contains, at an agreed price, less fees. A flat per-gram deal is
 * expressible in the same shape by setting the payable rate to 1 and using the
 * per-gram figure as the price.
 *
 * There are two ways to settle a lot, and both are legitimate:
 *
 *   - **From the assay.** Enter what the refiner reported and the arithmetic
 *     produces the payout. This is the only way to see variance — whether the
 *     assay matched the book, and whether this refiner is paying what they said.
 *   - **From the cheque.** Type the amount that actually landed. Some refiners
 *     send a figure and little else, and a dealer who has the money in hand
 *     should not have to reverse-engineer a payable rate to record it.
 *
 * The second is the truth when it is available, so it wins. Its number is the
 * *net* proceeds — what the refiner paid after their own deductions — so fees
 * recorded alongside it are kept for the record and never subtracted again.
 *
 * Pure and free of native imports, so the arithmetic that decides whether a
 * month was profitable can be tested on its own.
 */

export type LotStatus = 'open' | 'sent' | 'settled';

export interface AssayLine {
  id: string;
  metal: MetalSymbol;
  /** Gross weight the refiner reports receiving, in grams. */
  grossGrams: number;
  /** Assayed fineness, 0–1. */
  assayFineness: number;
  /** Fraction of the assayed pure content the refiner pays for, 0–1. */
  payableRate: number;
  /** Settlement price per troy ounce agreed for this lot. */
  pricePerTroyOz: number;
}

export interface LotFees {
  refining: number;
  assay: number;
  shipping: number;
  other: number;
}

export const NO_FEES: LotFees = { refining: 0, assay: 0, shipping: 0, other: 0 };

/** The shape `calculateExpectedContent` needs — a subset of InventoryItem. */
export interface LotItem {
  metal: MetalSymbol;
  purityId: string;
  weight: number;
  unit: WeightUnit;
  quantity: number;
  purchasePrice: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

/* ------------------------------------------------------------ one assay line */

export interface AssayLineResult {
  /** Pure metal the assay says is in the lot. */
  pureGrams: number;
  /** The portion the refiner actually pays for. */
  payableGrams: number;
  payableTroyOz: number;
  value: number;
}

export function calculateAssayLine(line: AssayLine): AssayLineResult {
  const grossGrams = Math.max(0, safe(line.grossGrams));
  const pureGrams = grossGrams * clamp01(line.assayFineness);
  const payableGrams = pureGrams * clamp01(line.payableRate);
  const payableTroyOz = payableGrams / TROY_OUNCE_IN_GRAMS;

  return {
    pureGrams,
    payableGrams,
    payableTroyOz,
    value: payableTroyOz * Math.max(0, safe(line.pricePerTroyOz)),
  };
}

/* ------------------------------------------------------- the whole settlement */

export interface SettlementInput {
  assayLines: AssayLine[];
  fees: LotFees;
  costBasis: number;
  /**
   * The net amount the refiner actually paid, when the operator has the
   * settlement in hand. Overrides the assay arithmetic entirely: it is a fact,
   * and the lines are an estimate of it.
   *
   * Undefined means "not reported yet". Zero is a real answer — a lot can come
   * back worthless — so it must not be conflated with absent.
   */
  actualPayout?: number;
}

export interface SettlementResult {
  /** Value of the payable content before fees, from the assay lines. */
  grossValue: number;
  feesTotal: number;
  /** What the refiner actually paid. */
  netSettlement: number;
  /** Where `netSettlement` came from — the cheque, or the arithmetic. */
  source: 'actual' | 'assay';
  /**
   * False when `netSettlement` is a reported net that already had the refiner's
   * deductions taken out. `feesTotal` is then a record, not a subtraction.
   */
  feesDeducted: boolean;
  /** What the items in the lot cost at the counter. */
  costBasis: number;
  /** netSettlement − costBasis. The number the whole business turns on. */
  profit: number;
  profitPercent: number;
  pureGramsByMetal: Record<MetalSymbol, number>;
  payableGramsByMetal: Record<MetalSymbol, number>;
}

export function calculateSettlement(input: SettlementInput): SettlementResult {
  const { assayLines: lines, fees, costBasis, actualPayout } = input;
  const pureGramsByMetal = zeroByMetal();
  const payableGramsByMetal = zeroByMetal();
  let grossValue = 0;

  for (const line of lines) {
    const result = calculateAssayLine(line);
    grossValue += result.value;
    pureGramsByMetal[line.metal] += result.pureGrams;
    payableGramsByMetal[line.metal] += result.payableGrams;
  }

  // Fees are costs; a negative fee would silently inflate a settlement.
  const feesTotal =
    Math.max(0, safe(fees.refining)) +
    Math.max(0, safe(fees.assay)) +
    Math.max(0, safe(fees.shipping)) +
    Math.max(0, safe(fees.other));

  // A reported payout is the money that arrived, so it is already net of
  // whatever the refiner took. Subtracting the recorded fees again would
  // charge the dealer twice and turn a fair lot into a loss on paper.
  const reported = actualPayout != null && Number.isFinite(actualPayout);
  const netSettlement = reported
    ? safe(actualPayout)
    // Deliberately not floored at zero: fees can exceed the value of a small
    // lot, and hiding that would hide exactly the lot you should stop sending.
    : grossValue - feesTotal;

  const basis = Math.max(0, safe(costBasis));
  const profit = netSettlement - basis;

  return {
    grossValue,
    feesTotal,
    netSettlement,
    source: reported ? 'actual' : 'assay',
    feesDeducted: !reported,
    costBasis: basis,
    profit,
    profitPercent: basis > 0 ? profit / basis : 0,
    pureGramsByMetal,
    payableGramsByMetal,
  };
}

/* ------------------------------------------------- what we thought we had */

export interface ExpectedContent {
  pureGramsByMetal: Record<MetalSymbol, number>;
  totalPureGrams: number;
  costBasis: number;
}

/**
 * What the book says is in the lot, from our own weights and stamped purities.
 * Compared against the assay, this is how a dealer catches an underkarated buy
 * — or a refiner shorting them.
 */
export function calculateExpectedContent(items: LotItem[]): ExpectedContent {
  const pureGramsByMetal = zeroByMetal();
  let costBasis = 0;

  for (const item of items) {
    const purity = findPurity(item.purityId);
    const result = calculateMelt({
      spotPerTroyOz: 0,
      weight: item.weight,
      unit: item.unit,
      fineness: purity?.fineness ?? 0,
      payoutRate: 1,
      quantity: item.quantity,
    });
    pureGramsByMetal[item.metal] += result.pureGrams;
    costBasis += Math.max(0, safe(item.purchasePrice));
  }

  return {
    pureGramsByMetal,
    totalPureGrams: METAL_ORDER.reduce((sum, m) => sum + pureGramsByMetal[m], 0),
    costBasis,
  };
}

export interface AssayVariance {
  metal: MetalSymbol;
  expectedPureGrams: number;
  assayedPureGrams: number;
  /** Positive means the assay found more than the book expected. */
  differenceGrams: number;
  differencePercent: number;
}

/**
 * Expected versus assayed, per metal. A consistent negative variance on one
 * refiner is a conversation worth having; a negative variance on one buyer's
 * intake is a training problem.
 */
export function calculateVariance(
  expected: ExpectedContent,
  settlement: SettlementResult,
): AssayVariance[] {
  return METAL_ORDER.filter(
    (metal) =>
      expected.pureGramsByMetal[metal] > 0 || settlement.pureGramsByMetal[metal] > 0,
  ).map((metal) => {
    const expectedPureGrams = expected.pureGramsByMetal[metal];
    const assayedPureGrams = settlement.pureGramsByMetal[metal];
    const differenceGrams = assayedPureGrams - expectedPureGrams;
    return {
      metal,
      expectedPureGrams,
      assayedPureGrams,
      differenceGrams,
      differencePercent: expectedPureGrams > 0 ? differenceGrams / expectedPureGrams : 0,
    };
  });
}

/**
 * Item ids already committed to a lot that has not settled.
 *
 * An item must not sit in two lots at once: both could be sent and settled,
 * and the same purchase price would be counted against two different refining
 * results. Settled lots are excluded because they are history — their items
 * are gone and cannot be re-committed anyway.
 */
export function activeLotItemIds(
  lots: { id: string; status: LotStatus; itemIds: string[] }[],
  excludeLotId?: string,
): Set<string> {
  const reserved = new Set<string>();
  for (const lot of lots) {
    if (lot.status === 'settled') continue;
    if (excludeLotId && lot.id === excludeLotId) continue;
    for (const id of lot.itemIds) reserved.add(id);
  }
  return reserved;
}

/* --------------------------------------------------------------- roll-ups */

export interface SettledLotLike {
  status: LotStatus;
  assayLines: AssayLine[];
  fees: LotFees;
  costBasis: number;
  actualPayout?: number;
}

/**
 * Profit banked across settled lots. Open and sent lots are excluded: until the
 * refiner reports, there is no number, and guessing one would flatter the book.
 */
export function realisedFromLots(lots: SettledLotLike[]): number {
  return lots
    .filter((lot) => lot.status === 'settled')
    .reduce((sum, lot) => sum + calculateSettlement(lot).profit, 0);
}

/**
 * Seeds the settlement form from what the book expects, so the operator edits
 * the refiner's actual figures rather than typing a page of numbers from
 * scratch. Payable rate defaults to 0.97, a common gold arrangement.
 */
export function suggestAssayLines(
  expected: ExpectedContent,
  spot: Partial<Record<MetalSymbol, number>>,
  makeId: () => string,
): AssayLine[] {
  return METAL_ORDER.filter((metal) => expected.pureGramsByMetal[metal] > 0).map((metal) => ({
    id: makeId(),
    metal,
    // Seeded as if the assay exactly matches the book: gross weight equal to the
    // expected pure content at .999 fine. The operator overwrites both with what
    // the refiner reported.
    grossGrams: expected.pureGramsByMetal[metal],
    assayFineness: 0.999,
    payableRate: 0.97,
    pricePerTroyOz: spot[metal] ?? 0,
  }));
}
