// Relative with an explicit extension: this module is exercised by the node
// test runner, which does not resolve the bundler's '@/' alias. Type-only
// imports are erased before Node sees them, so those may keep the alias.
import { TROY_OUNCE_IN_GRAMS, findPurity, type MetalSymbol } from './metals.ts';

/**
 * The coin catalog.
 *
 * A dealer's most repeated transaction is also the one this app made hardest:
 * someone puts a tube of Eagles or a bag of junk on the counter and the
 * operator has to recall a gross weight and a fineness before any arithmetic
 * can start. Every figure below is public and fixed by the mint, so there is no
 * reason to hold it in your head.
 *
 * The catalog does not introduce a second valuation path. Picking a coin fills
 * the same weight/purity/quantity fields an operator would have typed, and the
 * existing melt engine does the rest — so receipts, exports, the year-end P&L
 * and the portfolio all keep working with no knowledge that coins exist.
 *
 * ## Two ways to count
 *
 * Bullion is counted in coins: three Eagles is three Eagles. Circulated 90%
 * silver is counted in **face value** — "forty dollars face" — because a bag
 * holds an unknown mix of dimes, quarters and halves that all carry the same
 * silver per dollar of face. Both are supported, and the face route is the one
 * junk silver defaults to.
 *
 * ## Why worn silver is worth less than struck silver
 *
 * $1 of face in US 90% coin left the mint with 0.7234 ozt of silver in it.
 * Decades in circulation wear that down, and the entire trade prices it at
 * **0.715 ozt per dollar face** instead. That ~1.2% is not a rounding error;
 * on a $1,000-face bag it is most of an ounce. This module uses the trade
 * figure for face-value entry and the struck figure for individual coins, and
 * the screen says which is which — a dealer whose app disagreed with their own
 * mental math by 1.2% would stop trusting the app, correctly.
 */

export type CoinCategory = 'bullion' | 'junk' | 'numismatic';

/** Groups of circulated coin that the trade prices by face value, not by piece. */
export type JunkGroupId = 'us-90' | 'us-40' | 'us-35' | 'ca-80';

export interface JunkGroup {
  id: JunkGroupId;
  label: string;
  /**
   * Troy ounces of pure metal per one unit of face value, as the trade
   * actually pays — worn, not as-struck, where a wear convention exists.
   */
  aswPerFace: number;
  /** Currency the face value is denominated in, for the on-screen prefix. */
  faceCurrency: string;
  note: string;
}

export const JUNK_GROUPS: Record<JunkGroupId, JunkGroup> = {
  'us-90': {
    id: 'us-90',
    label: 'US 90% silver',
    aswPerFace: 0.715,
    faceCurrency: '$',
    note: 'Dimes, quarters and halves dated 1964 and earlier. Priced at 0.715 ozt per $1 face — the circulated trade standard, about 1.2% under the 0.7234 ozt they were struck with.',
  },
  'us-40': {
    id: 'us-40',
    label: 'US 40% silver',
    aswPerFace: 0.2958,
    faceCurrency: '$',
    note: 'Kennedy halves dated 1965 to 1970. 0.2958 ozt per $1 face — these saw little circulation, so the struck figure is the one the trade uses.',
  },
  'us-35': {
    id: 'us-35',
    label: 'US war nickels',
    aswPerFace: 1.1252,
    faceCurrency: '$',
    note: 'Nickels dated 1942 to 1945 with a large mint mark over the dome. 1.1252 ozt per $1 face — twenty coins, so a dollar of face is a lot of nickels.',
  },
  'ca-80': {
    id: 'ca-80',
    label: 'Canadian 80% silver',
    aswPerFace: 0.6,
    faceCurrency: 'C$',
    note: 'Dimes, quarters and halves dated 1966 and earlier. 0.600 ozt per C$1 face.',
  },
};

export interface Coin {
  id: string;
  name: string;
  metal: MetalSymbol;
  /** Links into PURITIES — the catalog never carries its own fineness. */
  purityId: string;
  /** Gross weight of one coin in grams, as struck. */
  grams: number;
  /**
   * Published pure-metal content of one coin, troy ounces. Redundant with
   * grams × fineness by design: it is the figure printed on every dealer sheet,
   * and holding both lets a test prove the two agree, which is how a
   * transposed digit gets caught before it prices a deal.
   */
  aswOzt: number;
  category: CoinCategory;
  /** Face value of one coin, for the pieces priced by face. */
  faceValue?: number;
  junkGroup?: JunkGroupId;
  /** Years struck to this specification — a Kennedy half is three different coins. */
  years?: string;
  /** Counter shorthand, so search finds it the way it gets said out loud. */
  aliases?: string[];
}

/**
 * Weights and finenesses are mint specifications. Where a published content
 * figure is rounded (a Silver Eagle is sold as "1 oz" though .999 of 31.103 g
 * is 0.999 ozt), the published figure is kept and the test tolerance absorbs
 * the difference — a real typo misses by far more than a rounding does.
 */
export const COINS: Coin[] = [
  /* ------------------------------------------------------------ gold bullion */
  { id: 'age-1', name: 'American Gold Eagle — 1 oz', metal: 'XAU', purityId: 'au-22', grams: 33.931, aswOzt: 1, category: 'bullion', aliases: ['AGE', 'eagle'] },
  { id: 'age-half', name: 'American Gold Eagle — 1/2 oz', metal: 'XAU', purityId: 'au-22', grams: 16.966, aswOzt: 0.5, category: 'bullion', aliases: ['AGE'] },
  { id: 'age-quarter', name: 'American Gold Eagle — 1/4 oz', metal: 'XAU', purityId: 'au-22', grams: 8.483, aswOzt: 0.25, category: 'bullion', aliases: ['AGE'] },
  { id: 'age-tenth', name: 'American Gold Eagle — 1/10 oz', metal: 'XAU', purityId: 'au-22', grams: 3.393, aswOzt: 0.1, category: 'bullion', aliases: ['AGE'] },
  { id: 'krugerrand-1', name: 'Krugerrand — 1 oz', metal: 'XAU', purityId: 'au-22', grams: 33.93, aswOzt: 1, category: 'bullion', aliases: ['krug'] },
  { id: 'maple-au-1', name: 'Canadian Gold Maple — 1 oz', metal: 'XAU', purityId: 'au-24', grams: 31.103, aswOzt: 1, category: 'bullion', aliases: ['maple'] },
  { id: 'buffalo-1', name: 'American Gold Buffalo — 1 oz', metal: 'XAU', purityId: 'au-24', grams: 31.103, aswOzt: 1, category: 'bullion' },

  /* ------------------------------------------------- circulating world gold */
  { id: 'sovereign', name: 'Gold Sovereign', metal: 'XAU', purityId: 'au-22', grams: 7.98805, aswOzt: 0.2354, category: 'bullion', aliases: ['sov'] },
  { id: 'peso-50', name: 'Mexican 50 Peso', metal: 'XAU', purityId: 'au-900', grams: 41.6666, aswOzt: 1.2057, category: 'bullion', aliases: ['centenario'] },
  { id: 'franc-20', name: '20 Franc — Rooster / Helvetia', metal: 'XAU', purityId: 'au-900', grams: 6.4516, aswOzt: 0.1867, category: 'bullion', aliases: ['rooster', 'napoleon'] },
  { id: 'double-eagle', name: 'US $20 Double Eagle', metal: 'XAU', purityId: 'au-900', grams: 33.436, aswOzt: 0.9675, category: 'numismatic', years: '1850–1933', faceValue: 20 },
  { id: 'eagle-10', name: 'US $10 Eagle', metal: 'XAU', purityId: 'au-900', grams: 16.718, aswOzt: 0.48375, category: 'numismatic', years: '1838–1933', faceValue: 10 },
  { id: 'half-eagle-5', name: 'US $5 Half Eagle', metal: 'XAU', purityId: 'au-900', grams: 8.359, aswOzt: 0.24187, category: 'numismatic', years: '1839–1929', faceValue: 5 },

  /* ---------------------------------------------------------- silver bullion */
  { id: 'ase-1', name: 'American Silver Eagle — 1 oz', metal: 'XAG', purityId: 'ag-999', grams: 31.103, aswOzt: 1, category: 'bullion', aliases: ['ASE', 'eagle'] },
  { id: 'maple-ag-1', name: 'Canadian Silver Maple — 1 oz', metal: 'XAG', purityId: 'ag-999', grams: 31.1, aswOzt: 1, category: 'bullion', aliases: ['maple'] },
  { id: 'britannia-ag-1', name: 'Britannia — 1 oz silver', metal: 'XAG', purityId: 'ag-999', grams: 31.21, aswOzt: 1, category: 'bullion' },

  /* ------------------------------------------------------------- junk silver */
  { id: 'us-dime-90', name: 'US dime — 90% silver', metal: 'XAG', purityId: 'ag-900', grams: 2.5, aswOzt: 0.07234, category: 'junk', faceValue: 0.1, junkGroup: 'us-90', years: '1964 and earlier', aliases: ['mercury', 'roosevelt', 'junk'] },
  { id: 'us-quarter-90', name: 'US quarter — 90% silver', metal: 'XAG', purityId: 'ag-900', grams: 6.25, aswOzt: 0.18084, category: 'junk', faceValue: 0.25, junkGroup: 'us-90', years: '1964 and earlier', aliases: ['washington', 'junk'] },
  { id: 'us-half-90', name: 'US half dollar — 90% silver', metal: 'XAG', purityId: 'ag-900', grams: 12.5, aswOzt: 0.36169, category: 'junk', faceValue: 0.5, junkGroup: 'us-90', years: '1964 and earlier', aliases: ['walker', 'franklin', 'junk'] },
  { id: 'us-half-40', name: 'US half dollar — 40% silver', metal: 'XAG', purityId: 'ag-400', grams: 11.5, aswOzt: 0.1479, category: 'junk', faceValue: 0.5, junkGroup: 'us-40', years: '1965–1970', aliases: ['kennedy', 'junk'] },
  { id: 'us-dollar-90', name: 'US silver dollar — Morgan / Peace', metal: 'XAG', purityId: 'ag-900', grams: 26.73, aswOzt: 0.77345, category: 'junk', faceValue: 1, years: '1878–1935', aliases: ['morgan', 'peace'] },
  { id: 'us-war-nickel', name: 'US war nickel — 35% silver', metal: 'XAG', purityId: 'ag-350', grams: 5, aswOzt: 0.05626, category: 'junk', faceValue: 0.05, junkGroup: 'us-35', years: '1942–1945', aliases: ['war nickel', 'junk'] },
  { id: 'ca-dime-80', name: 'Canadian dime — 80% silver', metal: 'XAG', purityId: 'ag-800', grams: 2.33, aswOzt: 0.05993, category: 'junk', faceValue: 0.1, junkGroup: 'ca-80', years: '1966 and earlier', aliases: ['junk'] },
  { id: 'ca-quarter-80', name: 'Canadian quarter — 80% silver', metal: 'XAG', purityId: 'ag-800', grams: 5.83, aswOzt: 0.14995, category: 'junk', faceValue: 0.25, junkGroup: 'ca-80', years: '1966 and earlier', aliases: ['junk'] },
  { id: 'ca-half-80', name: 'Canadian half dollar — 80% silver', metal: 'XAG', purityId: 'ag-800', grams: 11.66, aswOzt: 0.2999, category: 'junk', faceValue: 0.5, junkGroup: 'ca-80', years: '1966 and earlier', aliases: ['junk'] },

  /* ------------------------------------------------------------- platinum */
  { id: 'plat-eagle-1', name: 'American Platinum Eagle — 1 oz', metal: 'XPT', purityId: 'pt-999', grams: 31.103, aswOzt: 1, category: 'bullion' },
  { id: 'maple-pt-1', name: 'Canadian Platinum Maple — 1 oz', metal: 'XPT', purityId: 'pt-999', grams: 31.1, aswOzt: 1, category: 'bullion' },
];

export function findCoin(id: string): Coin | undefined {
  return COINS.find((c) => c.id === id);
}

export function coinsFor(metal: MetalSymbol): Coin[] {
  return COINS.filter((c) => c.metal === metal);
}

/**
 * Free-text match over the name, the years and the counter shorthand, so
 * "ASE", "junk", "90" and "kennedy" all land somewhere useful. Every term has
 * to match something; an empty query returns everything in catalog order.
 */
export function searchCoins(query: string, coins: Coin[] = COINS): Coin[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return coins;
  return coins.filter((coin) => {
    const haystack = [coin.name, coin.years ?? '', ...(coin.aliases ?? [])].join(' ').toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

export interface CoinEntry {
  /** Gross grams to record — what the engine multiplies by fineness. */
  grams: number;
  quantity: number;
  description: string;
}

/**
 * A count of coins, as inventory fields.
 *
 * Quantity stays separate from weight rather than being multiplied in, because
 * a record of "10 × Silver Eagle" prints and exports as ten coins. The melt
 * engine already multiplies by quantity.
 */
export function entryByCount(coin: Coin, count: number): CoinEntry {
  const quantity = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return {
    grams: coin.grams,
    quantity,
    description: quantity === 1 ? coin.name : `${coin.name} × ${quantity}`,
  };
}

/**
 * A face value of circulated coin, as inventory fields.
 *
 * The weight is worked back from what the trade pays per dollar of face, so
 * gross × fineness lands on the worn content rather than the struck content.
 * That keeps one melt engine honest for both routes instead of bolting a
 * second valuation path onto the app.
 */
export function entryByFace(coin: Coin, faceAmount: number): CoinEntry | null {
  const group = coin.junkGroup ? JUNK_GROUPS[coin.junkGroup] : undefined;
  const purity = findPurity(coin.purityId);
  if (!group || !purity || purity.fineness <= 0) return null;
  if (!Number.isFinite(faceAmount) || faceAmount <= 0) {
    return { grams: 0, quantity: 1, description: group.label };
  }

  const pureGrams = faceAmount * group.aswPerFace * TROY_OUNCE_IN_GRAMS;
  return {
    grams: pureGrams / purity.fineness,
    quantity: 1,
    description: `${group.label} — ${group.faceCurrency}${faceAmount.toFixed(2)} face`,
  };
}

/** Pure metal in one coin, grams — the figure the melt engine will arrive at. */
export function pureGramsOf(coin: Coin): number {
  return coin.aswOzt * TROY_OUNCE_IN_GRAMS;
}
