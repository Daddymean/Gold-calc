import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TROY_OUNCE_IN_GRAMS,
  calculateLot,
  calculateMelt,
  convertWeight,
  findPurity,
  payoutRateForOffer,
  puritiesFor,
  toGrams,
  ratePerWeight,
} from '../src/lib/metals.ts';
import { parseNumber } from '../src/lib/format.ts';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

/* ------------------------------------------------------------------ units */

test('troy conversions use the exact definitions', () => {
  close(toGrams(1, 'ozt'), 31.1034768);
  close(toGrams(20, 'dwt'), 31.1034768);
  close(toGrams(1, 'kg'), 1000);
  close(convertWeight(1, 'ozt', 'dwt'), 20);
  close(convertWeight(31.1034768, 'g', 'ozt'), 1);
});

test('a troy ounce is heavier than an avoirdupois ounce', () => {
  assert.ok(toGrams(1, 'ozt') > toGrams(1, 'ozAv'));
});

/* ------------------------------------------------------------- melt value */

test('14K gold melt matches the hand calculation', () => {
  // 10 g of 14K (0.58333 fine) at $2400/ozt.
  const result = calculateMelt({
    spotPerTroyOz: 2400,
    weight: 10,
    unit: 'g',
    fineness: 14 / 24,
    payoutRate: 0.8,
  });

  const expectedPure = 10 * (14 / 24);
  close(result.pureGrams, expectedPure);
  close(result.meltValue, (expectedPure / TROY_OUNCE_IN_GRAMS) * 2400, 1e-9);
  close(result.payout, result.meltValue * 0.8, 1e-9);
  close(result.margin, result.meltValue - result.payout, 1e-9);
});

test('pure metal at spot values one troy ounce at exactly spot', () => {
  const result = calculateMelt({
    spotPerTroyOz: 2000,
    weight: 1,
    unit: 'ozt',
    fineness: 1,
    payoutRate: 1,
  });
  close(result.meltValue, 2000, 1e-9);
  close(result.payout, 2000, 1e-9);
  close(result.margin, 0, 1e-9);
});

test('quantity multiplies the whole calculation', () => {
  const one = calculateMelt({
    spotPerTroyOz: 2400,
    weight: 5,
    unit: 'g',
    fineness: 0.75,
    payoutRate: 0.85,
  });
  const twelve = calculateMelt({
    spotPerTroyOz: 2400,
    weight: 5,
    unit: 'g',
    fineness: 0.75,
    payoutRate: 0.85,
    quantity: 12,
  });
  close(twelve.meltValue, one.meltValue * 12, 1e-9);
  close(twelve.pureGrams, one.pureGrams * 12, 1e-9);
});

test('per-unit rates quote the item as presented, not as pure metal', () => {
  const result = calculateMelt({
    spotPerTroyOz: 2400,
    weight: 1,
    unit: 'g',
    fineness: 0.5,
    payoutRate: 1,
  });
  // Half-fine metal is worth half the pure per-gram rate.
  close(result.perGram, (2400 / TROY_OUNCE_IN_GRAMS) * 0.5, 1e-9);
  close(result.perTroyOz, 1200, 1e-9);
  close(result.perDwt, result.perGram * (TROY_OUNCE_IN_GRAMS / 20), 1e-9);
});

/* ------------------------------------------------------ defensive inputs */

test('garbage input yields zeros rather than NaN', () => {
  const result = calculateMelt({
    spotPerTroyOz: Number.NaN,
    weight: Number.NaN,
    unit: 'g',
    fineness: 0.585,
    payoutRate: 0.8,
  });
  assert.equal(result.meltValue, 0);
  assert.equal(result.payout, 0);
  assert.ok(Number.isFinite(result.perGram));
});

test('negative weight is floored at zero, never a negative payout', () => {
  const result = calculateMelt({
    spotPerTroyOz: 2400,
    weight: -10,
    unit: 'g',
    fineness: 0.585,
    payoutRate: 0.8,
  });
  assert.equal(result.payout, 0);
});

test('payout rate and fineness are clamped to 0–1', () => {
  const overpaid = calculateMelt({
    spotPerTroyOz: 2400,
    weight: 10,
    unit: 'g',
    fineness: 5,
    payoutRate: 3,
  });
  const clean = calculateMelt({
    spotPerTroyOz: 2400,
    weight: 10,
    unit: 'g',
    fineness: 1,
    payoutRate: 1,
  });
  close(overpaid.meltValue, clean.meltValue, 1e-9);
  close(overpaid.payout, clean.payout, 1e-9);
});

/* ---------------------------------------------------------------- offers */

test('an offer converts back to the payout rate it represents', () => {
  const melt = 1000;
  close(payoutRateForOffer(800, melt), 0.8);
  close(payoutRateForOffer(800, 0), 0);
});

/* ------------------------------------------------------------------- lot */

test('lot totals equal the sum of their lines', () => {
  const spot = { XAU: 2400, XAG: 28 };
  const lines = [
    { id: '1', metal: 'XAU' as const, purityId: 'au-14', weight: 10, unit: 'g' as const },
    { id: '2', metal: 'XAU' as const, purityId: 'au-18', weight: 5, unit: 'g' as const },
    { id: '3', metal: 'XAG' as const, purityId: 'ag-925', weight: 100, unit: 'g' as const },
  ];

  const totals = calculateLot(lines, spot, 0.8);
  const manual = lines.reduce((sum, line) => {
    const purity = findPurity(line.purityId)!;
    return (
      sum +
      calculateMelt({
        spotPerTroyOz: spot[line.metal],
        weight: line.weight,
        unit: line.unit,
        fineness: purity.fineness,
        payoutRate: 0.8,
      }).meltValue
    );
  }, 0);

  close(totals.meltValue, manual, 1e-9);
  close(totals.payout, manual * 0.8, 1e-9);
  close(totals.pureGramsByMetal.XAU, 10 * (14 / 24) + 5 * 0.75, 1e-9);
  close(totals.pureGramsByMetal.XAG, 92.5, 1e-9);
});

test('a lot line with an unknown purity is skipped, not counted as pure', () => {
  const totals = calculateLot(
    [{ id: '1', metal: 'XAU', purityId: 'nonsense', weight: 10, unit: 'g' }],
    { XAU: 2400 },
    0.8,
  );
  assert.equal(totals.meltValue, 0);
});

test('a lot line whose metal has no quote contributes nothing', () => {
  const totals = calculateLot(
    [{ id: '1', metal: 'XPD', purityId: 'pd-950', weight: 10, unit: 'g' }],
    {},
    0.8,
  );
  assert.equal(totals.meltValue, 0);
  close(totals.pureGramsByMetal.XPD, 9.5, 1e-9);
});

/* -------------------------------------------------------------- purities */

test('karat table matches the standard finenesses', () => {
  close(findPurity('au-10')!.fineness, 0.41666, 1e-4);
  close(findPurity('au-14')!.fineness, 0.58333, 1e-4);
  close(findPurity('au-18')!.fineness, 0.75);
  close(findPurity('au-22')!.fineness, 0.91666, 1e-4);
  close(findPurity('ag-925')!.fineness, 0.925);
});

test('each metal offers only its own purities', () => {
  for (const purity of puritiesFor('XAU')) assert.equal(purity.metal, 'XAU');
  assert.ok(puritiesFor('XAG').length > 0);
  assert.ok(puritiesFor('XPD').every((p) => p.metal === 'XPD'));
});

/* ----------------------------------------------------------------- input */

test('parseNumber survives what people actually type', () => {
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('  8 '), 8);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('abc'), 0);
  assert.equal(parseNumber('.'), 0);
  assert.equal(parseNumber('-4.5'), -4.5);
});

test('parseNumber reads grouping separators as grouping, not as decimals', () => {
  assert.equal(parseNumber('$1,250.75'), 1250.75);
  assert.equal(parseNumber('1,250'), 1250);
  assert.equal(parseNumber('1,250,000'), 1250000);
  // European formatting: dot groups, comma marks the decimal.
  assert.equal(parseNumber('1.250,75'), 1250.75);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('12,55'), 12.55);
});

/* ------------------------------------------------- money per unit weight */

test('a price paid converts to the per-gram rate the trade quotes', () => {
  // "I paid $557 for that 18.4 g chain" — what a dealer says to another dealer
  // is the per-gram figure, so the record should carry it without arithmetic.
  const rates = ratePerWeight(556.8, 18.4);
  assert.ok(Math.abs(rates.perGram - 30.26) < 0.01);
  assert.ok(Math.abs(rates.perTroyOz - 30.26 * TROY_OUNCE_IN_GRAMS) < 0.05);
  assert.ok(Math.abs(rates.perDwt - rates.perGram * 1.55517384) < 0.001);
});

test('one troy ounce of metal rates at its own price per ounce', () => {
  const rates = ratePerWeight(2400, TROY_OUNCE_IN_GRAMS);
  assert.ok(Math.abs(rates.perTroyOz - 2400) < 1e-6);
});

test('a weightless or nonsense record rates at zero rather than infinity', () => {
  // Dividing by a zero weight would print "$Infinity/g" on a real record.
  assert.deepEqual(ratePerWeight(500, 0), { perGram: 0, perDwt: 0, perTroyOz: 0 });
  assert.deepEqual(ratePerWeight(500, -2), { perGram: 0, perDwt: 0, perTroyOz: 0 });
  assert.equal(ratePerWeight(Number.NaN, 10).perGram, 0);
});
