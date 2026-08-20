import test from 'node:test';
import assert from 'node:assert/strict';
import { summarisePortfolio, valueItem } from '../src/lib/portfolio.ts';
import { TROY_OUNCE_IN_GRAMS } from '../src/lib/metals.ts';

/**
 * The rule under test: recorded money is in the item's own currency, derived
 * value is in the display currency, and the two are only the same unit while
 * they match. Every test below exists because adding them anyway produces a
 * number that looks right and is not.
 */

type Item = Parameters<typeof valueItem>[0];

const base = {
  id: 'i1',
  ticket: 'T-1',
  description: 'Chain',
  metal: 'XAU',
  purityId: 'au-24',
  weight: TROY_OUNCE_IN_GRAMS, // exactly one troy ounce, so melt ≈ spot
  unit: 'g',
  quantity: 1,
  purchasePrice: 1000,
  currency: 'USD',
  spotAtPurchase: 2000,
  meltAtPurchase: 2000,
  transactionType: 'purchase',
  status: 'in_stock',
  photoUris: [],
  tags: [],
  purchasedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Item;

const item = (patch: Partial<Item> = {}): Item => ({ ...base, ...patch }) as Item;

const spot = { XAU: 2000, XAG: 25 };

/* ------------------------------------------------------------- valuation */

test('an item is worth its pure content at the current spot price', () => {
  const v = valueItem(item(), spot, 'USD');
  assert.ok(Math.abs(v.meltNow - 2000 * 0.9999) < 0.01);
  assert.ok(Math.abs(v.gain - (v.meltNow - 1000)) < 0.01);
  assert.equal(v.priced, true);
  assert.equal(v.comparable, true);
});

test('a metal with no live quote is flagged rather than valued at zero silently', () => {
  const v = valueItem(item({ metal: 'XPT', purityId: 'pt-950' } as Partial<Item>), spot, 'USD');
  assert.equal(v.priced, false);
  assert.equal(v.meltNow, 0);
});

test('a graded coin is worth its collector value, not its melt', () => {
  const v = valueItem(item({ isNumismatic: true, numismaticValue: 5000 } as Partial<Item>), spot, 'USD');
  assert.equal(v.meltNow, 5000);
});

test('a sold item is measured against what it actually sold for', () => {
  const v = valueItem(
    item({ status: 'sold', salePrice: 1800 } as Partial<Item>),
    { XAU: 999_999 },
    'USD',
  );
  assert.equal(v.gain, 800, 'later spot must not move a realised gain');
});

/* ---------------------------------------------------------- mixed currency */

test('an item bought in another currency still has a market value', () => {
  // Spot arrives in the display currency and the metal is physical, so this
  // half of the arithmetic is sound whatever the item cost.
  const v = valueItem(item({ currency: 'EUR' } as Partial<Item>), spot, 'USD');
  assert.ok(v.meltNow > 0);
  assert.equal(v.comparable, false);
});

test('but its gain is not reported, because the two figures are different units', () => {
  const v = valueItem(item({ currency: 'EUR' } as Partial<Item>), spot, 'USD');
  assert.equal(v.gain, 0);
  assert.equal(v.gainPercent, 0);
});

test('a numismatic value in another currency does not become the market value', () => {
  // €5,000 is not $5,000. Falling back to melt keeps the book in one unit.
  const v = valueItem(
    item({ currency: 'EUR', isNumismatic: true, numismaticValue: 5000 } as Partial<Item>),
    spot,
    'USD',
  );
  assert.notEqual(v.meltNow, 5000);
  assert.ok(Math.abs(v.meltNow - 2000 * 0.9999) < 0.01, 'melt, not the foreign collector price');
});

/* -------------------------------------------------------------- portfolio */

test('cost basis counts only what was paid in the currency on screen', () => {
  const summary = summarisePortfolio(
    [item({ id: 'a' }), item({ id: 'b', currency: 'EUR', purchasePrice: 900 } as Partial<Item>)],
    spot,
    'USD',
    [],
  );

  assert.equal(summary.heldCount, 2, 'both are on the shelf');
  assert.equal(summary.costBasis, 1000, 'the EUR purchase is not added to a USD total');
  assert.equal(summary.offCurrencyHeld, 1);
});

test('market value still covers the whole shelf', () => {
  const one = summarisePortfolio([item()], spot, 'USD', []);
  const two = summarisePortfolio(
    [item({ id: 'a' }), item({ id: 'b', currency: 'EUR' } as Partial<Item>)],
    spot,
    'USD',
    [],
  );
  assert.ok(Math.abs(two.marketValue - one.marketValue * 2) < 0.01);
  assert.ok(Math.abs(two.pureGramsByMetal.XAU - one.pureGramsByMetal.XAU * 2) < 0.001);
});

test('unrealised gain is measured against the items whose cost is counted', () => {
  // The bug this pins: crediting the whole shelf's market value against a cost
  // basis that excludes half of it, inventing a gain the size of the omission.
  const summary = summarisePortfolio(
    [item({ id: 'a' }), item({ id: 'b', currency: 'EUR', purchasePrice: 900 } as Partial<Item>)],
    spot,
    'USD',
    [],
  );
  const solo = summarisePortfolio([item({ id: 'a' })], spot, 'USD', []);
  assert.ok(Math.abs(summary.unrealisedGain - solo.unrealisedGain) < 0.01);
});

test('a book with no off-currency items reports none, and totals everything', () => {
  const summary = summarisePortfolio([item({ id: 'a' }), item({ id: 'b' })], spot, 'USD', []);
  assert.equal(summary.offCurrencyHeld, 0);
  assert.equal(summary.offCurrencySold, 0);
  assert.equal(summary.costBasis, 2000);
});

test('sold items move to realised, melted items leave the book', () => {
  const summary = summarisePortfolio(
    [
      item({ id: 'a', status: 'sold', salePrice: 1500 } as Partial<Item>),
      item({ id: 'b', status: 'melted' } as Partial<Item>),
      item({ id: 'c' }),
    ],
    spot,
    'USD',
    [],
  );
  assert.equal(summary.heldCount, 1);
  assert.equal(summary.realisedGain, 500);
});

test('a foreign sale does not contribute a realised gain either', () => {
  const summary = summarisePortfolio(
    [item({ id: 'a', status: 'sold', salePrice: 1500, currency: 'EUR' } as Partial<Item>)],
    spot,
    'USD',
    [],
  );
  assert.equal(summary.realisedGain, 0);
  assert.equal(summary.offCurrencySold, 1);
  assert.equal(summary.offCurrencyHeld, 0, 'a sold item is not also counted as held');
});

test('percentages do not divide by a zero cost basis', () => {
  const summary = summarisePortfolio(
    [item({ currency: 'EUR' } as Partial<Item>)],
    spot,
    'USD',
    [],
  );
  assert.equal(summary.costBasis, 0);
  assert.equal(Number.isFinite(summary.unrealisedPercent), true);
  assert.equal(summary.unrealisedPercent, 0);
});

test('a zero gain with nothing to compare is marked unknown, not flat', () => {
  // Otherwise the dashboard draws a green "▲ 0.00 (0.00%)" over a book whose
  // performance it has no way of knowing.
  const noCost = summarisePortfolio([item({ currency: 'EUR' } as Partial<Item>)], spot, 'USD', []);
  assert.equal(noCost.gainUnavailable, true);

  const known = summarisePortfolio([item()], spot, 'USD', []);
  assert.equal(known.gainUnavailable, false);
});

test('an empty book is not reported as having an unknown gain', () => {
  // Nothing held means nothing to explain; the screen shows its empty state.
  assert.equal(summarisePortfolio([], spot, 'USD', []).gainUnavailable, false);
});

/* --------------------------------------------- refining in realised P&L */

type Lot = Parameters<typeof summarisePortfolio>[3][number];

const lot = (patch: Partial<Lot> = {}): Lot =>
  ({
    status: 'settled',
    assayLines: [],
    fees: { refining: 0, assay: 0, shipping: 0, other: 0 },
    costBasis: 1000,
    actualPayout: 1300,
    currency: 'USD',
    ...patch,
  }) as Lot;

test('a settled melt lot counts towards realised profit', () => {
  // Scrap is where most of a dealer's profit is realised. A figure that showed
  // only shop sales would report a fraction of the year.
  const summary = summarisePortfolio([], spot, 'USD', [lot()]);
  assert.equal(summary.realisedFromRefining, 300);
  assert.equal(summary.realisedGain, 300);
});

test('sales and refining are both counted, and reported separately', () => {
  const summary = summarisePortfolio(
    [item({ status: 'sold', salePrice: 1500 } as Partial<Item>)],
    spot,
    'USD',
    [lot()],
  );
  assert.equal(summary.realisedFromSales, 500);
  assert.equal(summary.realisedFromRefining, 300);
  assert.equal(summary.realisedGain, 800);
});

test('a lot that lost money drags the realised total down', () => {
  // The bad batch the demo user asked about. It must reduce the year, not be
  // quietly floored at zero.
  const summary = summarisePortfolio([], spot, 'USD', [lot({ costBasis: 5000, actualPayout: 4100 })]);
  assert.equal(summary.realisedFromRefining, -900);
  assert.equal(summary.realisedGain, -900);
});

test('lots still at the refiner contribute nothing', () => {
  // Until they report there is no number, and inventing one flatters the book.
  const summary = summarisePortfolio([], spot, 'USD', [
    lot({ status: 'open' }),
    lot({ status: 'sent' }),
  ]);
  assert.equal(summary.realisedFromRefining, 0);
});

test('a lot priced in another currency is excluded and counted', () => {
  const summary = summarisePortfolio([], spot, 'USD', [lot({ currency: 'EUR' })]);
  assert.equal(summary.realisedFromRefining, 0);
  assert.equal(summary.offCurrencyLots, 1);
});

test('melted items are not double counted against their lot', () => {
  // The item left the shelf and its outcome is the lot's. Counting the item too
  // would book the same purchase twice.
  const melted = item({ id: 'm', status: 'melted' } as Partial<Item>);
  const withItem = summarisePortfolio([melted], spot, 'USD', [lot()]);
  const withoutItem = summarisePortfolio([], spot, 'USD', [lot()]);

  assert.equal(withItem.realisedGain, withoutItem.realisedGain);
  assert.equal(withItem.heldCount, 0);
  assert.equal(withItem.costBasis, 0, 'melted stock is no longer held inventory');
});
