/**
 * Domain core: metals, weight units, purity tables and the melt-value engine.
 *
 * Everything in here is pure and dependency-free so it can be unit tested with
 * plain node, and so the same math backs the calculator screen, the inventory
 * P&L numbers and any future export.
 */

export type MetalSymbol = 'XAU' | 'XAG' | 'XPT' | 'XPD';

export interface Metal {
  symbol: MetalSymbol;
  name: string;
  /** Short label used on chips and dense rows. */
  short: string;
  color: string;
}

/**
 * Series colours, not decoration.
 *
 * The literal metal colours (yellow / grey / grey / grey) are indistinguishable
 * to a colourblind reader and nearly so to everyone else, so these are a
 * validated categorical set instead: distinct in OKLab under deuteranopia and
 * protanopia, and contrast-safe on the dark surface. Every place a metal colour
 * appears it is paired with the Au/Ag/Pt/Pd symbol, so identity never rests on
 * hue alone.
 */
export const METALS: Record<MetalSymbol, Metal> = {
  XAU: { symbol: 'XAU', name: 'Gold', short: 'Au', color: '#BB881A' },
  XAG: { symbol: 'XAG', name: 'Silver', short: 'Ag', color: '#4299DC' },
  XPT: { symbol: 'XPT', name: 'Platinum', short: 'Pt', color: '#43A96E' },
  XPD: { symbol: 'XPD', name: 'Palladium', short: 'Pd', color: '#B576C3' },
};

export const METAL_ORDER: MetalSymbol[] = ['XAU', 'XAG', 'XPT', 'XPD'];

/* ------------------------------------------------------------------ units */

export type WeightUnit = 'g' | 'dwt' | 'ozt' | 'ozAv' | 'kg' | 'gr';

interface UnitDef {
  id: WeightUnit;
  label: string;
  /** How many grams one of this unit weighs. */
  grams: number;
}

/**
 * Troy weights are exact by definition: the troy ounce is 31.1034768 g and a
 * pennyweight is exactly 1/20 of that. Do not "round these off" — a tenth of a
 * gram of gold is real money at the counter.
 */
export const TROY_OUNCE_IN_GRAMS = 31.1034768;

export const WEIGHT_UNITS: Record<WeightUnit, UnitDef> = {
  g: { id: 'g', label: 'Grams', grams: 1 },
  dwt: { id: 'dwt', label: 'Pennyweight', grams: TROY_OUNCE_IN_GRAMS / 20 },
  ozt: { id: 'ozt', label: 'Troy oz', grams: TROY_OUNCE_IN_GRAMS },
  ozAv: { id: 'ozAv', label: 'Ounce (av)', grams: 28.349523125 },
  kg: { id: 'kg', label: 'Kilogram', grams: 1000 },
  gr: { id: 'gr', label: 'Grain', grams: 0.06479891 },
};

export const WEIGHT_UNIT_ORDER: WeightUnit[] = ['g', 'dwt', 'ozt', 'ozAv', 'kg', 'gr'];

export function toGrams(weight: number, unit: WeightUnit): number {
  return weight * WEIGHT_UNITS[unit].grams;
}

export function fromGrams(grams: number, unit: WeightUnit): number {
  return grams / WEIGHT_UNITS[unit].grams;
}

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  return fromGrams(toGrams(weight, from), to);
}

/* ---------------------------------------------------------------- purities */

export interface Purity {
  id: string;
  metal: MetalSymbol;
  label: string;
  /** Fraction of pure metal, 0–1. */
  fineness: number;
  /** Shown under the label — hallmark stamps a buyer actually sees. */
  hint?: string;
  /**
   * True when the fineness is a working convention rather than a property of
   * the piece in front of you. Karat gold is what it is stamped; filled stock
   * is a layer of gold over brass whose thickness varies by marking, so its
   * figure is representative and the screen has to say so.
   */
  nominal?: boolean;
  /** Shown when the purity is selected. Required reading for nominal entries. */
  note?: string;
}

/**
 * Karat golds use the nominal k/24 fineness, which is what scrap is bought on.
 * 24K is listed at .9999 rather than 1.0 because refined "pure" gold is .9999
 * fine in practice.
 */
export const PURITIES: Purity[] = [
  { id: 'au-6', metal: 'XAU', label: '6K', fineness: 6 / 24, hint: '250' },
  { id: 'au-8', metal: 'XAU', label: '8K', fineness: 8 / 24, hint: '333' },
  { id: 'au-9', metal: 'XAU', label: '9K', fineness: 9 / 24, hint: '375' },
  { id: 'au-10', metal: 'XAU', label: '10K', fineness: 10 / 24, hint: '417' },
  { id: 'au-12', metal: 'XAU', label: '12K', fineness: 12 / 24, hint: '500' },
  { id: 'au-14', metal: 'XAU', label: '14K', fineness: 14 / 24, hint: '585' },
  { id: 'au-15', metal: 'XAU', label: '15K', fineness: 15 / 24, hint: '625' },
  { id: 'au-18', metal: 'XAU', label: '18K', fineness: 18 / 24, hint: '750' },
  { id: 'au-20', metal: 'XAU', label: '20K', fineness: 20 / 24, hint: '833' },
  { id: 'au-21', metal: 'XAU', label: '21K', fineness: 21 / 24, hint: '875' },
  { id: 'au-22', metal: 'XAU', label: '22K', fineness: 22 / 24, hint: '917' },
  { id: 'au-24', metal: 'XAU', label: '24K', fineness: 0.9999, hint: '999' },

  // Filled and plated stock. Not karat gold: a layer bonded to a base metal.
  //
  // "Gold-filled" is a legal minimum of 1/20 of the item's weight in karat
  // gold, most often marked 1/20 12K — 5% of the weight at half fineness, so
  // 2.5% pure. Other markings exist (1/10 14K is 5.8%), which is why this is
  // nominal: weigh a mixed bin of it and this is the sane average, not a fact
  // about any one piece.
  {
    id: 'au-filled',
    metal: 'XAU',
    label: 'Gold-filled',
    fineness: 0.025,
    hint: '1/20 12K · GF',
    nominal: true,
    note: 'Gold-filled is a bonded layer over brass, not karat gold. 2.5% is the usual content for 1/20 12K; other markings run higher or lower, so treat the figure as a working average for a mixed lot rather than an assay of the piece.',
  },
  {
    id: 'au-plated',
    metal: 'XAU',
    label: 'Gold-plated',
    fineness: 0,
    hint: 'GP · HGE · GEP',
    nominal: true,
    note: 'Plating is microns thick and no refiner pays for it. Valued at nothing on purpose — if a piece is marked 1/20 or GF it is filled, not plated, and belongs under Gold-filled.',
  },

  { id: 'ag-800', metal: 'XAG', label: '.800', fineness: 0.8, hint: 'Continental' },
  { id: 'ag-830', metal: 'XAG', label: '.830', fineness: 0.83, hint: 'Scandinavian' },
  { id: 'ag-900', metal: 'XAG', label: '.900', fineness: 0.9, hint: 'US coin' },
  { id: 'ag-925', metal: 'XAG', label: '.925', fineness: 0.925, hint: 'Sterling' },
  { id: 'ag-958', metal: 'XAG', label: '.958', fineness: 0.958, hint: 'Britannia' },
  { id: 'ag-999', metal: 'XAG', label: '.999', fineness: 0.999, hint: 'Fine' },
  {
    id: 'ag-filled',
    metal: 'XAG',
    label: 'Silver-filled',
    fineness: 0.04625,
    hint: '1/20 sterling',
    nominal: true,
    note: 'Silver-filled is a sterling layer over base metal — 1/20 of the weight at .925, so about 4.6% fine. Nominal, like gold-filled: markings vary and a mixed bin averages out.',
  },

  { id: 'pt-585', metal: 'XPT', label: '.585', fineness: 0.585 },
  { id: 'pt-850', metal: 'XPT', label: '.850', fineness: 0.85 },
  { id: 'pt-900', metal: 'XPT', label: '.900', fineness: 0.9 },
  { id: 'pt-950', metal: 'XPT', label: '.950', fineness: 0.95, hint: 'Jewellery' },
  { id: 'pt-999', metal: 'XPT', label: '.999', fineness: 0.999, hint: 'Fine' },

  { id: 'pd-500', metal: 'XPD', label: '.500', fineness: 0.5 },
  { id: 'pd-950', metal: 'XPD', label: '.950', fineness: 0.95 },
  { id: 'pd-999', metal: 'XPD', label: '.999', fineness: 0.999, hint: 'Fine' },
];

export function puritiesFor(metal: MetalSymbol): Purity[] {
  return PURITIES.filter((p) => p.metal === metal);
}

export function findPurity(id: string): Purity | undefined {
  return PURITIES.find((p) => p.id === id);
}

/** Sensible starting purity per metal — the one most walk-in scrap actually is. */
export const DEFAULT_PURITY: Record<MetalSymbol, string> = {
  XAU: 'au-14',
  XAG: 'ag-925',
  XPT: 'pt-950',
  XPD: 'pd-950',
};

/* -------------------------------------------------------------- the engine */

export interface MeltInput {
  /** Spot price of the pure metal, per troy ounce, in the display currency. */
  spotPerTroyOz: number;
  weight: number;
  unit: WeightUnit;
  /** Fraction of pure metal, 0–1. */
  fineness: number;
  /** Fraction of melt you pay the seller, 0–1. Buyers run 0.7–0.9 on scrap. */
  payoutRate: number;
  /** Optional per-item count multiplier (e.g. 12 identical rings). */
  quantity?: number;
}

export interface MeltResult {
  grams: number;
  /** Grams of actual precious metal after purity is applied. */
  pureGrams: number;
  pureTroyOz: number;
  /** Full melt value at spot — the ceiling, never the offer. */
  meltValue: number;
  /** What you hand the customer. */
  payout: number;
  /** meltValue − payout. Your gross margin before refining loss and fees. */
  margin: number;
  /** Melt value of one gram of the item as presented (mixed purity included). */
  perGram: number;
  perDwt: number;
  perTroyOz: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function calculateMelt(input: MeltInput): MeltResult {
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const safeWeight = Number.isFinite(input.weight) ? Math.max(0, input.weight) : 0;
  const safeSpot = Number.isFinite(input.spotPerTroyOz) ? Math.max(0, input.spotPerTroyOz) : 0;
  const fineness = clamp01(input.fineness);
  const payoutRate = clamp01(input.payoutRate);

  const grams = toGrams(safeWeight, input.unit) * quantity;
  const pureGrams = grams * fineness;
  const pureTroyOz = pureGrams / TROY_OUNCE_IN_GRAMS;

  const meltValue = pureTroyOz * safeSpot;
  const payout = meltValue * payoutRate;

  // Per-unit rates describe the item as weighed, so a 14K ring quotes the 14K
  // rate rather than the pure-gold rate. That is the number you read aloud.
  const spotPerGram = safeSpot / TROY_OUNCE_IN_GRAMS;
  const perGram = spotPerGram * fineness;

  return {
    grams,
    pureGrams,
    pureTroyOz,
    meltValue,
    payout,
    margin: meltValue - payout,
    perGram,
    perDwt: perGram * WEIGHT_UNITS.dwt.grams,
    perTroyOz: safeSpot * fineness,
  };
}

/**
 * Reverse the engine: given a price you are willing to pay, what payout rate
 * does that represent? Used by the "offer" field so a buyer can type a round
 * number and immediately see the percentage it implies.
 */
export function payoutRateForOffer(offer: number, meltValue: number): number {
  if (!Number.isFinite(offer) || meltValue <= 0) return 0;
  return offer / meltValue;
}

/* --------------------------------------------------------- scrap lot roll-up */

export interface LotLine {
  id: string;
  metal: MetalSymbol;
  purityId: string;
  weight: number;
  unit: WeightUnit;
  quantity?: number;
}

export interface LotTotals {
  meltValue: number;
  payout: number;
  margin: number;
  pureGramsByMetal: Record<MetalSymbol, number>;
}

/**
 * A walk-in rarely brings one clean item — it is a bag of mixed karats. This
 * folds each line through the same engine so the bag totals cannot drift away
 * from the per-line numbers shown on screen.
 */
export function calculateLot(
  lines: LotLine[],
  spot: Partial<Record<MetalSymbol, number>>,
  payoutRate: number,
): LotTotals {
  const totals: LotTotals = {
    meltValue: 0,
    payout: 0,
    margin: 0,
    pureGramsByMetal: { XAU: 0, XAG: 0, XPT: 0, XPD: 0 },
  };

  for (const line of lines) {
    const purity = findPurity(line.purityId);
    if (!purity) continue;
    const result = calculateMelt({
      spotPerTroyOz: spot[line.metal] ?? 0,
      weight: line.weight,
      unit: line.unit,
      fineness: purity.fineness,
      payoutRate,
      quantity: line.quantity,
    });
    totals.meltValue += result.meltValue;
    totals.payout += result.payout;
    totals.margin += result.margin;
    totals.pureGramsByMetal[line.metal] += result.pureGrams;
  }

  return totals;
}
