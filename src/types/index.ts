import type { MetalSymbol, WeightUnit } from '@/lib/metals';
import type { CurrencyCode } from '@/lib/format';

// Re-exported so consumers can pull the whole vocabulary from one module.
export type { MetalSymbol, WeightUnit } from '@/lib/metals';
export type { CurrencyCode } from '@/lib/format';
export type { BuyRule } from '@/lib/buyTable';
export type { AssayLine, LotFees, LotStatus } from '@/lib/refining';

/** How the item came through the door. Drives compliance prompts and reporting. */
export type TransactionType = 'purchase' | 'consignment' | 'trade' | 'sale';

export type ItemStatus = 'in_stock' | 'on_hold' | 'sold' | 'melted';

export type IdType = 'drivers_license' | 'passport' | 'state_id' | 'military_id' | 'other';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  /**
   * Most jurisdictions require a secondhand-dealer record of who sold you the
   * metal. Stored on device only; never leaves the phone unless exported.
   */
  idType?: IdType;
  idNumber?: string;
  idExpiry?: string;
  dateOfBirth?: string;
  notes?: string;
  /** Local file URI of an ID photo, if the operator chose to capture one. */
  idPhotoUri?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  /** Human-facing ticket number, e.g. "T-1042". Unique per device. */
  ticket: string;
  description: string;
  metal: MetalSymbol;
  purityId: string;
  weight: number;
  unit: WeightUnit;
  quantity: number;

  purchasePrice: number;
  currency: CurrencyCode;
  /** Spot at the moment of purchase, so historic margin stays honest. */
  spotAtPurchase: number;
  /** Melt value at the moment of purchase. */
  meltAtPurchase: number;

  transactionType: TransactionType;
  status: ItemStatus;
  /** Set when status becomes 'sold'. */
  salePrice?: number;
  soldAt?: string;

  customerId?: string;
  /** Denormalised for fast list rendering and for records that outlive a customer. */
  customerName?: string;
  /**
   * The seller exactly as recorded when this transaction happened.
   *
   * The customer record is live — an ID gets renewed, someone moves house — but
   * a receipt is an audit document, and reprinting one must show the details
   * that were actually checked that day, not today's. Absent on records written
   * before snapshots existed; those fall back to the live customer.
   */
  sellerAtSale?: {
    name?: string;
    phone?: string;
    address?: string;
    idType?: IdType;
    idNumber?: string;
  };

  photoUris: string[];
  tags: string[];
  location?: string;
  notes?: string;

  /** Optional numismatic detail — a graded coin is not scrap. */
  isNumismatic?: boolean;
  numismaticValue?: number;

  purchasedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A parcel of scrap sent to a refiner.
 *
 * Items leave the shelf as a lot and come back as money weeks later. Until the
 * refiner reports, the profit on everything in here is unknown — which is why
 * the lot carries its own frozen cost basis rather than recomputing from items
 * that may since have been edited.
 */
export interface MeltLot {
  id: string;
  /** Human-facing reference, e.g. "L-0007". */
  reference: string;
  refinerName: string;
  itemIds: string[];
  status: import('@/lib/refining').LotStatus;

  /** What the items cost at the counter, frozen when the lot is sent. */
  costBasis: number;
  currency: import('@/lib/format').CurrencyCode;

  assayLines: import('@/lib/refining').AssayLine[];
  fees: import('@/lib/refining').LotFees;
  /**
   * What the refiner actually paid, net, when the operator has the settlement
   * in hand. Takes precedence over the assay arithmetic — see `refining.ts`.
   * Undefined means not reported; zero means a lot that came back worthless.
   */
  actualPayout?: number;

  notes?: string;
  createdAt: string;
  sentAt?: string;
  settledAt?: string;
}

export interface Settings {
  currency: CurrencyCode;
  /** Default fraction of melt paid out on scrap, 0–1. */
  defaultPayoutRate: number;
  defaultUnit: WeightUnit;
  defaultMetal: MetalSymbol;
  /** Business name printed on receipts and exports. */
  businessName: string;
  /** Ask for seller ID details when logging a purchase. */
  requireCustomerId: boolean;
  /** Days an item must be held before melting, per local ordinance. 0 = none. */
  holdPeriodDays: number;
  spotProvider: 'demo' | 'metals.dev' | 'goldapi';
  spotApiKey: string;
  /** Minutes between automatic spot refreshes. */
  refreshMinutes: number;

  /** Let the buy table pick the payout rate instead of the flat default. */
  useBuyTable: boolean;
  /** Require device authentication before the book opens. */
  appLockEnabled: boolean;
  /**
   * Delete stored ID photos this many days after capture. 0 keeps them
   * indefinitely. Holding a customer's ID image longer than your rules require
   * is a liability, so this exists to make forgetting automatic.
   */
  idPhotoRetentionDays: number;
}

export interface SpotQuote {
  metal: MetalSymbol;
  /** Price per troy ounce in `currency`. */
  price: number;
  currency: CurrencyCode;
  /** Absolute change vs previous close. */
  change: number;
  /** Fractional change vs previous close, e.g. 0.0125 for +1.25%. */
  changePercent: number;
  previousClose: number;
  high24h?: number;
  low24h?: number;
  fetchedAt: string;
}

export interface PricePoint {
  /** ISO date, day resolution for history. */
  date: string;
  price: number;
}

export type HistoryRange = '7d' | '30d' | '90d' | '1y' | '5y';

export interface PriceHistory {
  metal: MetalSymbol;
  currency: CurrencyCode;
  range: HistoryRange;
  points: PricePoint[];
  fetchedAt: string;
}
