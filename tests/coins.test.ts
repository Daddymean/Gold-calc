import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COINS,
  JUNK_GROUPS,
  entryByCount,
  entryByFace,
  findCoin,
  searchCoins,
  type Coin,
} from '../src/lib/coins.ts';
import { TROY_OUNCE_IN_GRAMS, calculateMelt, findPurity } from '../src/lib/metals.ts';

/**
 * The catalog is data, and data that prices deals has to be provably
 * self-consistent. Every test here exists to catch a wrong number before it
 * reaches a counter, not to check that TypeScript compiled.
 */

/* ------------------------------------------------------- catalog integrity */

test('every coin carries a purity the engine knows', () => {
  for (const coin of COINS) {
    assert.ok(findPurity(coin.purityId), `${coin.id} references unknown purity ${coin.purityId}`);
  }
});

test('every coin has a purity belonging to its own metal', () => {
  // A silver coin pointing at a gold purity would still melt — at the wrong
  // spot price, silently, for as long as nobody checked.
  for (const coin of COINS) {
    assert.equal(findPurity(coin.purityId)!.metal, coin.metal, `${coin.id} purity is the wrong metal`);
  }
});

test('coin ids are unique', () => {
  assert.equal(new Set(COINS.map((c) => c.id)).size, COINS.length);
});

test('published content agrees with gross weight times fineness', () => {
  // The catalog holds both figures precisely so they can be cross-checked. A
  // transposed digit moves the answer by percent; published rounding moves it
  // by a tenth of one, so half a percent separates the two cleanly.
  for (const coin of COINS) {
    const derived = (coin.grams * findPurity(coin.purityId)!.fineness) / TROY_OUNCE_IN_GRAMS;
    const drift = Math.abs(derived - coin.aswOzt) / coin.aswOzt;
    assert.ok(
      drift < 0.005,
      `${coin.id}: published ${coin.aswOzt} ozt vs ${derived.toFixed(5)} ozt from ${coin.grams} g (${(drift * 100).toFixed(2)}% apart)`,
    );
  }
});

test('a coin priced by face declares a face value', () => {
  for (const coin of COINS) {
    if (coin.junkGroup) assert.ok(coin.faceValue, `${coin.id} is in a junk group with no face value`);
  }
});

test('each junk group agrees with the coins in it', () => {
  // Every 90% coin carries the same silver per dollar of face — that is the
  // whole reason the trade prices a mixed bag by face at all. The group figure
  // is the worn one, so it must sit just below each coin's struck rate.
  for (const coin of COINS) {
    if (!coin.junkGroup) continue;
    const group = JUNK_GROUPS[coin.junkGroup];
    const struckPerFace = coin.aswOzt / coin.faceValue!;
    // The bound is 0.5% either way, not zero. A group rate is a published
    // convention rounded to three decimals — Canada quotes 0.600 though a dime
    // works out to 0.5993 — so it can sit a hair above one denomination's
    // struck content. What this catches is a coin filed under the wrong group,
    // which misses by whole percent.
    const drift = (group.aswPerFace - struckPerFace) / struckPerFace;
    assert.ok(
      drift < 0.005,
      `${coin.id} would be paid ${(drift * 100).toFixed(2)}% above its struck content by the ${group.id} rate`,
    );
    assert.ok(
      drift > -0.03,
      `${coin.id} is more than 3% under the ${group.id} rate — wrong group?`,
    );
  }
});

/* -------------------------------------------------------------- by the coin */

test('a count of coins records the coin weight and the count, not the product', () => {
  // The record has to read as ten coins on a receipt, and the melt engine
  // already multiplies by quantity. Folding the count into the weight would
  // double it there.
  const ase = findCoin('ase-1')!;
  const entry = entryByCount(ase, 10);
  assert.equal(entry.grams, 31.103);
  assert.equal(entry.quantity, 10);
  assert.match(entry.description, /× 10/);
});

test('one coin is described without a multiplier', () => {
  assert.equal(entryByCount(findCoin('krugerrand-1')!, 1).description, 'Krugerrand — 1 oz');
});

test('a fractional count of coins is impossible and rounds down', () => {
  assert.equal(entryByCount(findCoin('ase-1')!, 2.7).quantity, 2);
  assert.equal(entryByCount(findCoin('ase-1')!, -5).quantity, 0);
});

test('ten Silver Eagles melt to ten ounces of silver', () => {
  // End to end through the real engine: catalog figures in, melt value out.
  const entry = entryByCount(findCoin('ase-1')!, 10);
  const melt = calculateMelt({
    spotPerTroyOz: 30,
    weight: entry.grams,
    unit: 'g',
    fineness: findPurity('ag-999')!.fineness,
    payoutRate: 1,
    quantity: entry.quantity,
  });
  assert.ok(Math.abs(melt.pureTroyOz - 10) < 0.02, `${melt.pureTroyOz} ozt`);
  assert.ok(Math.abs(melt.meltValue - 300) < 0.6, `${melt.meltValue}`);
});

/* -------------------------------------------------------------- by the face */

test('a bag of junk is valued on the worn rate the trade actually pays', () => {
  // $40 face of 90% is 28.6 ozt at the trade's 0.715, not the 28.94 ozt it was
  // struck with. Paying the struck figure gives away 1.2% of every bag.
  const entry = entryByFace(findCoin('us-quarter-90')!, 40)!;
  const pureGrams = entry.grams * findPurity('ag-900')!.fineness;
  assert.ok(Math.abs(pureGrams / TROY_OUNCE_IN_GRAMS - 28.6) < 0.001);
});

test('the face route runs through the same melt engine as everything else', () => {
  const entry = entryByFace(findCoin('us-quarter-90')!, 100)!;
  const melt = calculateMelt({
    spotPerTroyOz: 30,
    weight: entry.grams,
    unit: 'g',
    fineness: findPurity('ag-900')!.fineness,
    payoutRate: 1,
    quantity: entry.quantity,
  });
  assert.ok(Math.abs(melt.pureTroyOz - 71.5) < 0.01, `${melt.pureTroyOz} ozt`);
  assert.ok(Math.abs(melt.meltValue - 2145) < 0.5, `${melt.meltValue}`);
});

test('the description says what was counted, because the weight no longer shows it', () => {
  assert.equal(
    entryByFace(findCoin('us-half-40')!, 25)!.description,
    'US 40% silver — $25.00 face',
  );
});

test('Canadian face value is labelled in Canadian dollars', () => {
  assert.match(entryByFace(findCoin('ca-quarter-80')!, 10)!.description, /C\$10\.00 face/);
});

test('a coin with no junk group cannot be entered by face', () => {
  // A Silver Eagle has a $1 face value and is worth thirty times that. Anyone
  // reaching this path has confused two different meanings of "face".
  assert.equal(entryByFace(findCoin('ase-1')!, 40), null);
});

test('an empty face amount yields no weight rather than a nonsense one', () => {
  const entry = entryByFace(findCoin('us-dime-90')!, 0)!;
  assert.equal(entry.grams, 0);
});

/* ------------------------------------------------------------------ search */

test('search finds a coin by the shorthand it gets called at the counter', () => {
  assert.ok(searchCoins('ASE').some((c) => c.id === 'ase-1'));
  assert.ok(searchCoins('krug').some((c) => c.id === 'krugerrand-1'));
  assert.ok(searchCoins('kennedy').some((c) => c.id === 'us-half-40'));
});

test('search by year finds the coin that year distinguishes', () => {
  const hits = searchCoins('1965');
  assert.ok(hits.some((c) => c.id === 'us-half-40'), 'the 40% half is the 1965 coin');
});

test('every term has to match, so two words narrow rather than widen', () => {
  const broad = searchCoins('silver');
  const narrow = searchCoins('silver canadian');
  assert.ok(narrow.length < broad.length);
  assert.ok(narrow.every((c: Coin) => /canadian/i.test(c.name)));
});

test('an empty query lists the whole catalog', () => {
  assert.equal(searchCoins('').length, COINS.length);
  assert.equal(searchCoins('   ').length, COINS.length);
});
