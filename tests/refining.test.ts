import test from 'node:test';
import assert from 'node:assert/strict';
import { TROY_OUNCE_IN_GRAMS } from '../src/lib/metals.ts';
import {
  NO_FEES,
  activeLotItemIds,
  calculateAssayLine,
  calculateExpectedContent,
  calculateSettlement,
  calculateVariance,
  realisedFromLots,
  suggestAssayLines,
  type AssayLine,
  type LotItem,
} from '../src/lib/refining.ts';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

const line = (partial: Partial<AssayLine> = {}): AssayLine => ({
  id: 'l1',
  metal: 'XAU',
  grossGrams: 100,
  assayFineness: 0.585,
  payableRate: 0.97,
  pricePerTroyOz: 2400,
  ...partial,
});

/* ------------------------------------------------------------ assay lines */

test('an assay line pays for the payable share of assayed content', () => {
  const result = calculateAssayLine(line());

  close(result.pureGrams, 58.5);
  close(result.payableGrams, 58.5 * 0.97);
  close(result.payableTroyOz, (58.5 * 0.97) / TROY_OUNCE_IN_GRAMS);
  close(result.value, ((58.5 * 0.97) / TROY_OUNCE_IN_GRAMS) * 2400, 1e-9);
});

test('a full payable rate on fine metal settles at spot', () => {
  const result = calculateAssayLine(
    line({ grossGrams: TROY_OUNCE_IN_GRAMS, assayFineness: 1, payableRate: 1, pricePerTroyOz: 2000 }),
  );
  close(result.value, 2000, 1e-9);
});

test('a flat per-gram deal is expressible in the same shape', () => {
  // Payable rate 1 and a price of (per-gram x grams-per-troy-oz) reproduces a
  // flat per-gram arrangement, so the model covers both kinds of contract.
  const perGram = 40;
  const result = calculateAssayLine(
    line({
      grossGrams: 50,
      assayFineness: 1,
      payableRate: 1,
      pricePerTroyOz: perGram * TROY_OUNCE_IN_GRAMS,
    }),
  );
  close(result.value, 50 * perGram, 1e-9);
});

test('assay fineness and payable rate are clamped to 0-1', () => {
  const wild = calculateAssayLine(line({ assayFineness: 4, payableRate: 3 }));
  const clean = calculateAssayLine(line({ assayFineness: 1, payableRate: 1 }));
  close(wild.value, clean.value, 1e-9);
});

test('garbage input yields zero rather than NaN', () => {
  const result = calculateAssayLine(line({ grossGrams: Number.NaN, pricePerTroyOz: Number.NaN }));
  assert.equal(result.value, 0);
  assert.ok(Number.isFinite(result.pureGrams));
});

/* ------------------------------------------------------------- settlement */

test('settlement nets fees off the gross and reconciles against cost', () => {
  const lines = [line({ grossGrams: 100, assayFineness: 0.585, payableRate: 0.97 })];
  const fees = { refining: 45, assay: 25, shipping: 18, other: 0 };
  const gross = calculateAssayLine(lines[0]).value;

  const result = calculateSettlement({ assayLines: lines, fees, costBasis: 3000 });

  close(result.grossValue, gross, 1e-9);
  close(result.feesTotal, 88);
  close(result.netSettlement, gross - 88, 1e-9);
  close(result.profit, gross - 88 - 3000, 1e-9);
  close(result.profitPercent, (gross - 88 - 3000) / 3000, 1e-9);
});

test('a lot whose fees exceed its value reports a loss rather than zero', () => {
  // Hiding this would hide exactly the lot that should stop being sent.
  const result = calculateSettlement({ assayLines: [line({ grossGrams: 1 })], fees: { ...NO_FEES, refining: 500 }, costBasis: 30 });
  assert.ok(result.netSettlement < 0);
  assert.ok(result.profit < 0);
});

test('negative fees cannot inflate a settlement', () => {
  const withNegative = calculateSettlement({ assayLines: [line()], fees: { ...NO_FEES, refining: -1000 }, costBasis: 0 });
  const withNone = calculateSettlement({ assayLines: [line()], fees: NO_FEES, costBasis: 0 });
  close(withNegative.netSettlement, withNone.netSettlement, 1e-9);
});

test('settlement totals across several metals', () => {
  const lines = [
    line({ id: 'a', metal: 'XAU', grossGrams: 60, assayFineness: 0.75, payableRate: 0.97, pricePerTroyOz: 2400 }),
    line({ id: 'b', metal: 'XAG', grossGrams: 2000, assayFineness: 0.925, payableRate: 0.9, pricePerTroyOz: 28 }),
  ];
  const result = calculateSettlement({ assayLines: lines, fees: NO_FEES, costBasis: 0 });

  close(result.pureGramsByMetal.XAU, 45);
  close(result.pureGramsByMetal.XAG, 1850);
  close(result.payableGramsByMetal.XAU, 45 * 0.97);
  close(result.payableGramsByMetal.XAG, 1850 * 0.9);
  close(
    result.grossValue,
    calculateAssayLine(lines[0]).value + calculateAssayLine(lines[1]).value,
    1e-9,
  );
});

test('an empty lot settles to nothing', () => {
  const result = calculateSettlement({ assayLines: [], fees: NO_FEES, costBasis: 0 });
  assert.equal(result.grossValue, 0);
  assert.equal(result.profit, 0);
  assert.equal(result.profitPercent, 0);
});

/* ---------------------------------------------------------------- expected */

const items: LotItem[] = [
  { metal: 'XAU', purityId: 'au-14', weight: 40, unit: 'g', quantity: 1, purchasePrice: 1500 },
  { metal: 'XAU', purityId: 'au-18', weight: 20, unit: 'g', quantity: 1, purchasePrice: 1000 },
  { metal: 'XAG', purityId: 'ag-925', weight: 1000, unit: 'g', quantity: 1, purchasePrice: 600 },
];

test('expected content comes from the book weights and stamped purities', () => {
  const expected = calculateExpectedContent(items);

  close(expected.pureGramsByMetal.XAU, 40 * (14 / 24) + 20 * 0.75);
  close(expected.pureGramsByMetal.XAG, 925);
  close(expected.costBasis, 3100);
  close(expected.totalPureGrams, 40 * (14 / 24) + 20 * 0.75 + 925);
});

test('expected content counts quantity', () => {
  const single = calculateExpectedContent([items[0]]);
  const dozen = calculateExpectedContent([{ ...items[0], quantity: 12 }]);
  close(dozen.pureGramsByMetal.XAU, single.pureGramsByMetal.XAU * 12);
});

/* ---------------------------------------------------------------- variance */

test('variance reports the assay coming in under the book', () => {
  const expected = calculateExpectedContent([items[0]]);
  const expectedGrams = expected.pureGramsByMetal.XAU;

  // Refiner assays 5% less pure gold than the stamps suggested.
  const settlement = calculateSettlement({
    assayLines: [line({ grossGrams: expectedGrams * 0.95, assayFineness: 1 })],
    fees: NO_FEES,
    costBasis: 0,
  });

  const variance = calculateVariance(expected, settlement);
  const gold = variance.find((v) => v.metal === 'XAU')!;

  close(gold.expectedPureGrams, expectedGrams);
  close(gold.assayedPureGrams, expectedGrams * 0.95, 1e-9);
  assert.ok(gold.differenceGrams < 0, 'a short assay is a negative difference');
  close(gold.differencePercent, -0.05, 1e-9);
});

test('variance covers metals present on either side only', () => {
  const expected = calculateExpectedContent(items);
  const settlement = calculateSettlement({ assayLines: [line({ metal: 'XAU', grossGrams: 50 })], fees: NO_FEES, costBasis: 0 });
  const metals = calculateVariance(expected, settlement).map((v) => v.metal);

  assert.deepEqual(metals.sort(), ['XAG', 'XAU'], 'silver was expected but not assayed');
  assert.ok(!metals.includes('XPT'), 'platinum appears on neither side');
});

test('an unexpected metal in the assay still shows up', () => {
  const expected = calculateExpectedContent([items[0]]);
  const settlement = calculateSettlement({ assayLines: [line({ metal: 'XPT', grossGrams: 10 })], fees: NO_FEES, costBasis: 0 });
  const platinum = calculateVariance(expected, settlement).find((v) => v.metal === 'XPT')!;

  assert.equal(platinum.expectedPureGrams, 0);
  assert.ok(platinum.assayedPureGrams > 0);
  // No baseline to divide by, so the percentage stays at zero rather than Infinity.
  assert.equal(platinum.differencePercent, 0);
});

/* --------------------------------------------------------------- roll-ups */

test('only settled lots contribute to realised profit', () => {
  const lot = (status: 'open' | 'sent' | 'settled') => ({
    status,
    assayLines: [line({ grossGrams: 100, assayFineness: 1, payableRate: 1, pricePerTroyOz: 2400 })],
    fees: NO_FEES,
    costBasis: 5000,
  });

  const oneSettled = calculateSettlement({ assayLines: lot('settled').assayLines, fees: NO_FEES, costBasis: 5000 }).profit;

  close(realisedFromLots([lot('settled')]), oneSettled, 1e-9);
  assert.equal(realisedFromLots([lot('open'), lot('sent')]), 0);
  close(realisedFromLots([lot('settled'), lot('sent'), lot('settled')]), oneSettled * 2, 1e-9);
});

test('no lots means no realised profit', () => {
  assert.equal(realisedFromLots([]), 0);
});

/* -------------------------------------------------------------- suggestion */

test('suggested lines cover every metal in the lot and nothing else', () => {
  let n = 0;
  const expected = calculateExpectedContent(items);
  const suggested = suggestAssayLines(expected, { XAU: 2400, XAG: 28 }, () => `id${++n}`);

  assert.deepEqual(suggested.map((l) => l.metal), ['XAU', 'XAG']);
  close(suggested[0].grossGrams, expected.pureGramsByMetal.XAU);
  assert.equal(suggested[0].pricePerTroyOz, 2400);
});

test('a suggested line with no live price is left at zero for the operator to fill', () => {
  const expected = calculateExpectedContent([items[0]]);
  const suggested = suggestAssayLines(expected, {}, () => 'id');
  assert.equal(suggested[0].pricePerTroyOz, 0);
});

/* -------------------------------------------------------- lot reservation */

test('items in unsettled lots are reserved, settled ones are not', () => {
  const lots = [
    { id: 'a', status: 'open' as const, itemIds: ['i1', 'i2'] },
    { id: 'b', status: 'sent' as const, itemIds: ['i3'] },
    { id: 'c', status: 'settled' as const, itemIds: ['i4'] },
  ];
  const reserved = activeLotItemIds(lots);

  assert.ok(reserved.has('i1') && reserved.has('i2') && reserved.has('i3'));
  assert.ok(!reserved.has('i4'), 'a settled lot is history and reserves nothing');
});

test('a lot can be excluded so it does not reserve against itself', () => {
  const lots = [{ id: 'a', status: 'open' as const, itemIds: ['i1'] }];
  assert.ok(activeLotItemIds(lots).has('i1'));
  assert.ok(!activeLotItemIds(lots, 'a').has('i1'));
});

test('no lots reserve nothing', () => {
  assert.equal(activeLotItemIds([]).size, 0);
});

/* ------------------------------------------- settling from the cheque */

test('a reported payout is the settlement, whatever the lines say', () => {
  // The refiner sent money. That figure is a fact and the assay arithmetic is
  // an estimate of it, so the fact wins.
  const result = calculateSettlement({
    assayLines: [line({ grossGrams: 100, pricePerTroyOz: 2000 })],
    fees: NO_FEES,
    costBasis: 3000,
    actualPayout: 4182.6,
  });

  assert.equal(result.netSettlement, 4182.6);
  assert.ok(Math.abs(result.profit - 1182.6) < 0.001);
  assert.equal(result.source, 'actual');
});

test('fees are never taken off a reported payout', () => {
  // The cheque already had the refiner's deductions removed. Subtracting the
  // recorded fees again would charge the dealer twice for the same 2%.
  const fees = { refining: 200, assay: 35, shipping: 40, other: 0 };
  const result = calculateSettlement({
    assayLines: [],
    fees,
    costBasis: 1000,
    actualPayout: 1500,
  });

  assert.equal(result.netSettlement, 1500, 'not 1500 − 275');
  assert.equal(result.profit, 500);
  assert.equal(result.feesTotal, 275, 'still recorded');
  assert.equal(result.feesDeducted, false, 'but not applied');
});

test('a payout of zero is a real answer, not a missing one', () => {
  // A bad batch can come back worth nothing, and that loss has to show.
  const nothing = calculateSettlement({
    assayLines: [line({ grossGrams: 100 })],
    fees: NO_FEES,
    costBasis: 900,
    actualPayout: 0,
  });
  assert.equal(nothing.source, 'actual');
  assert.equal(nothing.netSettlement, 0);
  assert.equal(nothing.profit, -900, 'the whole cost is a loss');

  const notReported = calculateSettlement({
    assayLines: [line({ grossGrams: 100 })],
    fees: NO_FEES,
    costBasis: 900,
  });
  assert.equal(notReported.source, 'assay', 'undefined still means "settle from the lines"');
  assert.ok(notReported.netSettlement > 0);
});

test('a lot that came back short is reported as the loss it is', () => {
  // The case the demo user described: a bad batch. Nothing floors this at zero.
  const result = calculateSettlement({
    assayLines: [],
    fees: NO_FEES,
    costBasis: 5000,
    actualPayout: 4100,
  });
  assert.equal(result.profit, -900);
  assert.ok(result.profitPercent < 0);
});

test('settling from the cheque still reconciles against the lot cost', () => {
  const result = calculateSettlement({
    assayLines: [],
    fees: NO_FEES,
    costBasis: 2000,
    actualPayout: 2500,
  });
  assert.equal(result.costBasis, 2000);
  assert.equal(result.profitPercent, 0.25);
});

test('realised profit counts reported payouts alongside assayed ones', () => {
  const assayed = { status: 'settled' as const, assayLines: [line({ grossGrams: 50 })], fees: NO_FEES, costBasis: 100 };
  const reported = { status: 'settled' as const, assayLines: [], fees: NO_FEES, costBasis: 1000, actualPayout: 1250 };

  const total = realisedFromLots([assayed, reported]);
  const assayedOnly = realisedFromLots([assayed]);
  assert.ok(Math.abs(total - (assayedOnly + 250)) < 0.01);
});
