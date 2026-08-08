import { calculateMelt, findPurity, type MetalSymbol, type WeightUnit } from './metals.ts';
import { starterRules, type BuyRule } from './buyTable.ts';
import type { Customer, InventoryItem, ItemStatus, TransactionType } from '@/types';

/**
 * Sample book for the hosted demo.
 *
 * A prospective user landing on an empty app cannot tell what it does, so the
 * public build seeds a realistic counter's worth of records. Every number is
 * derived through the real melt engine from a stated spot price on the purchase
 * date, so the margins, the "paid vs melt then" percentages and the portfolio
 * totals are all internally consistent rather than invented.
 *
 * This never runs in the shipped app — it is gated on the demo build flag.
 */

interface SeedItem {
  daysAgo: number;
  description: string;
  metal: MetalSymbol;
  purityId: string;
  weight: number;
  unit: WeightUnit;
  quantity?: number;
  /** Spot per troy ounce on the day it was bought. */
  spotThen: number;
  /** Fraction of melt paid. */
  payout: number;
  status: ItemStatus;
  transactionType?: TransactionType;
  customer?: number;
  tags: string[];
  location?: string;
  notes?: string;
  isNumismatic?: boolean;
  numismaticValue?: number;
  /** Multiple of cost realised on sale, for items already gone. */
  soldAtMultiple?: number;
}

const SEED_CUSTOMERS: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Marla Whitfield',
    phone: '555 0142',
    email: 'marla.w@example.com',
    idType: 'drivers_license',
    idNumber: 'W4471209',
    idExpiry: '2029-04',
    notes: 'Estate clearance for her mother. Expects to bring more next month.',
  },
  {
    name: 'Desmond Ray',
    phone: '555 0188',
    idType: 'state_id',
    idNumber: 'SR8830115',
    notes: 'Regular. Sells scrap every few weeks, always weighed and sorted.',
  },
  {
    name: 'Priya Raghunathan',
    phone: '555 0119',
    email: 'p.raghu@example.com',
    idType: 'passport',
    idNumber: 'X21884390',
    idExpiry: '2031-09',
  },
  {
    name: 'Tom Alderidge',
    phone: '555 0163',
    idType: 'drivers_license',
    idNumber: 'A9920417',
    notes: 'Coin collector. Buys as often as he sells.',
  },
];

const SEED_ITEMS: SeedItem[] = [
  {
    daysAgo: 3,
    description: "Ladies' rope chain, broken clasp",
    metal: 'XAU',
    purityId: 'au-14',
    weight: 18.4,
    unit: 'g',
    spotThen: 2241,
    payout: 0.72,
    status: 'in_stock',
    customer: 0,
    tags: ['scrap', 'chain'],
    location: 'Safe 2, tray B',
    notes: 'Acid tested 14K. Clasp missing, rest is sound.',
  },
  {
    daysAgo: 6,
    description: 'Mixed scrap lot — rings and earrings',
    metal: 'XAU',
    purityId: 'au-10',
    weight: 41.2,
    unit: 'g',
    quantity: 1,
    spotThen: 2233,
    payout: 0.8,
    status: 'in_stock',
    customer: 1,
    tags: ['scrap', 'lot'],
    location: 'Safe 2, tray B',
  },
  {
    daysAgo: 11,
    description: 'Sterling flatware, 42 pieces',
    metal: 'XAG',
    purityId: 'ag-925',
    weight: 1840,
    unit: 'g',
    spotThen: 27.6,
    payout: 0.72,
    status: 'in_stock',
    customer: 0,
    tags: ['sterling', 'flatware', 'estate'],
    location: 'Back shelf',
    notes: 'Monogrammed. Weighed without the knife handles, which are filled.',
  },
  {
    daysAgo: 18,
    description: '22K bangle set',
    metal: 'XAU',
    purityId: 'au-22',
    weight: 62.5,
    unit: 'g',
    spotThen: 2258,
    payout: 0.92,
    status: 'in_stock',
    customer: 2,
    tags: ['bangle', 'high-karat'],
    location: 'Safe 1',
    notes: 'Indian workmanship, excellent condition. Held for retail, not scrap.',
  },
  {
    daysAgo: 24,
    description: '1 oz Krugerrand, 1978',
    metal: 'XAU',
    purityId: 'au-22',
    weight: 33.93,
    unit: 'g',
    spotThen: 2249,
    payout: 0.97,
    status: 'on_hold',
    customer: 3,
    tags: ['bullion', 'coin'],
    location: 'Safe 1',
    isNumismatic: true,
    numismaticValue: 2390,
    notes: 'Sells at a premium over melt. Holding for a regular buyer.',
  },
  {
    daysAgo: 33,
    description: 'Platinum wedding band',
    metal: 'XPT',
    purityId: 'pt-950',
    weight: 8.1,
    unit: 'g',
    spotThen: 971,
    payout: 0.7,
    status: 'in_stock',
    customer: 1,
    tags: ['ring'],
    location: 'Safe 2, tray A',
  },
  {
    daysAgo: 47,
    description: 'Dental gold, assorted',
    metal: 'XAU',
    purityId: 'au-18',
    weight: 12.8,
    unit: 'g',
    spotThen: 2205,
    payout: 0.72,
    status: 'melted',
    customer: 1,
    tags: ['dental', 'refined'],
    notes: 'Sent with the March refining lot.',
  },
  {
    daysAgo: 58,
    description: '18K herringbone necklace',
    metal: 'XAU',
    purityId: 'au-18',
    weight: 27.9,
    unit: 'g',
    spotThen: 2189,
    payout: 0.8,
    status: 'sold',
    customer: 2,
    tags: ['chain'],
    soldAtMultiple: 1.34,
  },
  {
    daysAgo: 72,
    description: '90% silver half dollars, $40 face',
    metal: 'XAG',
    purityId: 'ag-900',
    weight: 892,
    unit: 'g',
    spotThen: 26.9,
    payout: 0.72,
    status: 'sold',
    customer: 3,
    tags: ['junk silver', 'coin'],
    soldAtMultiple: 1.21,
  },
  {
    daysAgo: 90,
    description: 'Palladium sponge, lab surplus',
    metal: 'XPD',
    purityId: 'pd-999',
    weight: 22.4,
    unit: 'g',
    spotThen: 998,
    payout: 0.7,
    status: 'in_stock',
    tags: ['industrial'],
    transactionType: 'trade',
    location: 'Safe 2, tray C',
  },
];

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export interface DemoBook {
  customers: Customer[];
  items: InventoryItem[];
  buyRules: BuyRule[];
}

/**
 * Builds the sample book. `makeId` is injected so ids come from the same
 * generator the rest of the app uses.
 */
export function buildDemoBook(makeId: () => string): DemoBook {
  const customers: Customer[] = SEED_CUSTOMERS.map((seed, i) => ({
    ...seed,
    id: makeId(),
    createdAt: iso(120 - i * 12),
    updatedAt: iso(120 - i * 12),
  }));

  const items: InventoryItem[] = SEED_ITEMS.map((seed, i) => {
    const purity = findPurity(seed.purityId);
    const melt = calculateMelt({
      spotPerTroyOz: seed.spotThen,
      weight: seed.weight,
      unit: seed.unit,
      fineness: purity?.fineness ?? 0,
      payoutRate: seed.payout,
      quantity: seed.quantity,
    });

    const purchasedAt = iso(seed.daysAgo);
    const linked = seed.customer != null ? customers[seed.customer] : undefined;

    return {
      id: makeId(),
      ticket: `T-${String(1000 + SEED_ITEMS.length - i).padStart(4, '0')}`,
      description: seed.description,
      metal: seed.metal,
      purityId: seed.purityId,
      weight: seed.weight,
      unit: seed.unit,
      quantity: seed.quantity ?? 1,
      purchasePrice: Math.round(melt.payout * 100) / 100,
      currency: 'USD',
      spotAtPurchase: seed.spotThen,
      meltAtPurchase: melt.meltValue,
      transactionType: seed.transactionType ?? 'purchase',
      status: seed.status,
      salePrice:
        seed.status === 'sold' && seed.soldAtMultiple
          ? Math.round(melt.payout * seed.soldAtMultiple * 100) / 100
          : undefined,
      soldAt: seed.status === 'sold' ? iso(Math.max(0, seed.daysAgo - 20)) : undefined,
      customerId: linked?.id,
      customerName: linked?.name,
      photoUris: [],
      tags: seed.tags,
      location: seed.location,
      notes: seed.notes,
      isNumismatic: seed.isNumismatic,
      numismaticValue: seed.numismaticValue,
      purchasedAt,
      createdAt: purchasedAt,
      updatedAt: purchasedAt,
    };
  });

  return { customers, items, buyRules: starterRules(makeId) };
}
