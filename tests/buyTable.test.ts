import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findOverlaps,
  resolveRate,
  rulesForMetal,
  starterRules,
  type BuyRule,
} from '../src/lib/buyTable.ts';

let counter = 0;
const makeId = () => `r${++counter}`;

const rule = (partial: Partial<BuyRule>): BuyRule => ({
  id: makeId(),
  metal: 'XAU',
  purityId: null,
  minGrams: 0,
  maxGrams: null,
  rate: 0.75,
  ...partial,
});

/* --------------------------------------------------------------- fallback */

test('an empty table falls back to the default rate', () => {
  const resolved = resolveRate([], { metal: 'XAU', purityId: 'au-14', weight: 10, unit: 'g' }, 0.8);
  assert.equal(resolved.rate, 0.8);
  assert.equal(resolved.rule, null);
});

test('a table with no matching rule falls back and says so', () => {
  const rules = [rule({ metal: 'XAG' })];
  const resolved = resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight: 10, unit: 'g' }, 0.8);
  assert.equal(resolved.rate, 0.8);
  assert.equal(resolved.rule, null);
  assert.match(resolved.reason, /No table rule matches/);
});

/* -------------------------------------------------------------- matching */

test('a metal-wide rule applies to any purity of that metal', () => {
  const rules = [rule({ rate: 0.7 })];
  for (const purityId of ['au-10', 'au-14', 'au-22']) {
    assert.equal(
      resolveRate(rules, { metal: 'XAU', purityId, weight: 5, unit: 'g' }, 0.5).rate,
      0.7,
    );
  }
});

test('rules never leak across metals', () => {
  const rules = [rule({ metal: 'XAU', rate: 0.9 })];
  const silver = resolveRate(rules, { metal: 'XAG', purityId: 'ag-925', weight: 100, unit: 'g' }, 0.4);
  assert.equal(silver.rate, 0.4);
});

/* ------------------------------------------------------------ weight bands */

test('the weight band is chosen by gross grams, whatever unit was typed', () => {
  const rules = [
    rule({ minGrams: 0, maxGrams: 31.1, rate: 0.7 }),
    rule({ minGrams: 31.1, maxGrams: null, rate: 0.85 }),
  ];
  // One troy ounce is 31.103 g, which lands in the upper band.
  const inOunces = resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight: 1, unit: 'ozt' }, 0.5);
  assert.equal(inOunces.rate, 0.85);

  const inGrams = resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight: 20, unit: 'g' }, 0.5);
  assert.equal(inGrams.rate, 0.7);
});

test('band edges are inclusive at the bottom and exclusive at the top', () => {
  const rules = [
    rule({ minGrams: 0, maxGrams: 50, rate: 0.7 }),
    rule({ minGrams: 50, maxGrams: null, rate: 0.85 }),
  ];
  const query = (weight: number) =>
    resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight, unit: 'g' }, 0.5).rate;

  assert.equal(query(49.99), 0.7);
  assert.equal(query(50), 0.85, 'exactly 50 g belongs to the upper band, not both');
  assert.equal(query(50.01), 0.85);
});

test('quantity is counted toward the weight band', () => {
  const rules = [
    rule({ minGrams: 0, maxGrams: 50, rate: 0.7 }),
    rule({ minGrams: 50, maxGrams: null, rate: 0.85 }),
  ];
  // Twelve 5 g rings is a 60 g lot and should earn the volume rate.
  const resolved = resolveRate(
    rules,
    { metal: 'XAU', purityId: 'au-14', weight: 5, unit: 'g', quantity: 12 },
    0.5,
  );
  assert.equal(resolved.rate, 0.85);
});

/* ------------------------------------------------------------ specificity */

test('an exact purity rule beats a metal-wide rule', () => {
  const rules = [
    rule({ purityId: null, rate: 0.75 }),
    rule({ purityId: 'au-18', rate: 0.88 }),
  ];
  assert.equal(
    resolveRate(rules, { metal: 'XAU', purityId: 'au-18', weight: 10, unit: 'g' }, 0.5).rate,
    0.88,
  );
  assert.equal(
    resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight: 10, unit: 'g' }, 0.5).rate,
    0.75,
  );
});

test('the narrower weight band wins among equally specific rules', () => {
  const rules = [
    rule({ minGrams: 0, maxGrams: null, rate: 0.7 }),
    rule({ minGrams: 10, maxGrams: 20, rate: 0.82 }),
  ];
  assert.equal(
    resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight: 15, unit: 'g' }, 0.5).rate,
    0.82,
  );
  assert.equal(
    resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight: 25, unit: 'g' }, 0.5).rate,
    0.7,
  );
});

test('a carve-out survives a general rule added later', () => {
  // The order rules were created in must not change the answer.
  const carveOut = rule({ purityId: 'au-22', minGrams: 50, maxGrams: null, rate: 0.92 });
  const general = rule({ purityId: null, minGrams: 0, maxGrams: null, rate: 0.7 });

  for (const rules of [[carveOut, general], [general, carveOut]]) {
    const resolved = resolveRate(rules, { metal: 'XAU', purityId: 'au-22', weight: 60, unit: 'g' }, 0.5);
    assert.equal(resolved.rate, 0.92);
  }
});

/* -------------------------------------------------------------- hygiene */

test('rates are clamped to 0-1 so a typo cannot pay 900% of melt', () => {
  const high = resolveRate([rule({ rate: 9 })], { metal: 'XAU', purityId: 'au-14', weight: 1, unit: 'g' }, 0.5);
  assert.equal(high.rate, 1);
  const low = resolveRate([rule({ rate: -3 })], { metal: 'XAU', purityId: 'au-14', weight: 1, unit: 'g' }, 0.5);
  assert.equal(low.rate, 0);
});

test('a fallback rate out of range is clamped too', () => {
  assert.equal(resolveRate([], { metal: 'XAU', purityId: 'au-14', weight: 1, unit: 'g' }, 4).rate, 1);
});

test('overlapping bands are reported', () => {
  const a = rule({ minGrams: 0, maxGrams: 60 });
  const b = rule({ minGrams: 50, maxGrams: null });
  assert.equal(findOverlaps([a, b]).length, 1);

  const clean = [rule({ minGrams: 0, maxGrams: 50 }), rule({ minGrams: 50, maxGrams: null })];
  assert.equal(findOverlaps(clean).length, 0);
});

test('overlap detection ignores different metals and purities', () => {
  const gold = rule({ metal: 'XAU', minGrams: 0, maxGrams: null });
  const silver = rule({ metal: 'XAG', minGrams: 0, maxGrams: null });
  const karat = rule({ metal: 'XAU', purityId: 'au-18', minGrams: 0, maxGrams: null });
  assert.equal(findOverlaps([gold, silver, karat]).length, 0);
});

/* -------------------------------------------------------------- starter */

test('the starter table covers all four metals and has no overlaps', () => {
  const rules = starterRules(makeId);
  assert.equal(findOverlaps(rules).length, 0);
  for (const metal of ['XAU', 'XAG', 'XPT', 'XPD'] as const) {
    assert.ok(rulesForMetal(rules, metal).length > 0, `${metal} has no rule`);
  }
});

test('every weight resolves against the starter table', () => {
  const rules = starterRules(makeId);
  for (const weight of [0.1, 5, 31.1, 100, 250, 1000, 5000]) {
    const resolved = resolveRate(rules, { metal: 'XAU', purityId: 'au-14', weight, unit: 'g' }, 0.5);
    assert.notEqual(resolved.rule, null, `no gold rule matched ${weight} g`);
  }
});
