// Relative with an explicit extension: exercised by the node test runner, which
// does not resolve the bundler's '@/' alias. Type-only imports are erased.
import { calculateSettlement } from './refining.ts';
import type { CurrencyCode } from '@/lib/format';
import type { InventoryItem, MeltLot } from '@/types';

/**
 * Realised profit and loss, by year.
 *
 * A dealer's year is two streams that arrive at different times. A piece sold
 * over the counter realises on the day it sells. A parcel of scrap realises
 * weeks after it leaves the shelf, when the refiner reports — and sometimes at
 * a loss, which is exactly the case that has to survive into the report rather
 * than being quietly rounded away.
 *
 * Cost is recognised against the event that realised it: an item's purchase
 * price counts in the year it sold, not the year it was bought, and a lot's
 * cost basis counts in the year it settled. Stock still on the shelf is not in
 * here at all; unrealised gains are not income.
 *
 * This is a record of what the book says, arranged so an accountant can read
 * it. It is not tax advice, and the app says so where the operator can see it.
 */

export type RealisedKind = 'sale' | 'refining';

export interface RealisedEvent {
  id: string;
  kind: RealisedKind;
  /** ISO date the profit was realised: the sale, or the refiner's settlement. */
  date: string;
  /** Ticket for a sale, lot reference for a settlement. */
  reference: string;
  description: string;
  /** What came in. */
  proceeds: number;
  /** What it had cost. */
  cost: number;
  /** proceeds − cost. Negative on a bad batch, and left that way. */
  profit: number;
  currency: CurrencyCode;
}

/** Calendar year of an ISO date, or null if it cannot be read. */
export function yearOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const year = new Date(iso).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * Everything that has actually realised, newest first.
 *
 * Items in a settled lot are deliberately not walked: their outcome is the
 * lot's, and counting both would book the same purchase twice.
 */
export function realisedEvents(items: InventoryItem[], lots: MeltLot[]): RealisedEvent[] {
  const events: RealisedEvent[] = [];

  for (const item of items) {
    if (item.status !== 'sold' || item.salePrice == null || !item.soldAt) continue;
    events.push({
      id: `sale:${item.id}`,
      kind: 'sale',
      date: item.soldAt,
      reference: item.ticket,
      description: item.description || 'Item',
      proceeds: item.salePrice,
      cost: item.purchasePrice,
      profit: item.salePrice - item.purchasePrice,
      currency: item.currency,
    });
  }

  for (const lot of lots) {
    if (lot.status !== 'settled' || !lot.settledAt) continue;
    const result = calculateSettlement(lot);
    events.push({
      id: `lot:${lot.id}`,
      kind: 'refining',
      date: lot.settledAt,
      reference: lot.reference,
      description: lot.refinerName
        ? `Melt lot — ${lot.refinerName}`
        : 'Melt lot',
      proceeds: result.netSettlement,
      cost: result.costBasis,
      profit: result.profit,
      currency: lot.currency,
    });
  }

  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Years that have at least one realised event, newest first. */
export function availableYears(events: RealisedEvent[]): number[] {
  const years = new Set<number>();
  for (const event of events) {
    const year = yearOf(event.date);
    if (year != null) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export interface YearSummary {
  year: number;
  /** Everything that realised in the year, in the reporting currency. */
  events: RealisedEvent[];
  proceeds: number;
  cost: number;
  profit: number;

  /** The same split the dashboard shows, because the two streams are taxed alike but managed differently. */
  salesProceeds: number;
  salesCost: number;
  salesProfit: number;
  refiningProceeds: number;
  refiningCost: number;
  refiningProfit: number;

  /** Lots and sales that lost money. Worth seeing on its own; it is the reason to change refiner or buyer. */
  losingCount: number;
  losses: number;

  /**
   * Events left out because they were recorded in another currency. They are
   * not converted — the app has no rate for the day each one realised — so the
   * report names them rather than folding them into a total.
   */
  excluded: RealisedEvent[];
}

export function summariseYear(
  events: RealisedEvent[],
  year: number,
  reportingCurrency: CurrencyCode,
): YearSummary {
  const summary: YearSummary = {
    year,
    events: [],
    proceeds: 0,
    cost: 0,
    profit: 0,
    salesProceeds: 0,
    salesCost: 0,
    salesProfit: 0,
    refiningProceeds: 0,
    refiningCost: 0,
    refiningProfit: 0,
    losingCount: 0,
    losses: 0,
    excluded: [],
  };

  for (const event of events) {
    if (yearOf(event.date) !== year) continue;

    if (event.currency !== reportingCurrency) {
      summary.excluded.push(event);
      continue;
    }

    summary.events.push(event);
    summary.proceeds += event.proceeds;
    summary.cost += event.cost;

    if (event.kind === 'sale') {
      summary.salesProceeds += event.proceeds;
      summary.salesCost += event.cost;
    } else {
      summary.refiningProceeds += event.proceeds;
      summary.refiningCost += event.cost;
    }

    // A loss is not netted away silently. Two good months and one ruinous lot
    // is a different business from three flat months, and only one of them is
    // a reason to stop sending to that refiner.
    if (event.profit < 0) {
      summary.losingCount += 1;
      summary.losses += event.profit;
    }
  }

  summary.profit = summary.proceeds - summary.cost;
  summary.salesProfit = summary.salesProceeds - summary.salesCost;
  summary.refiningProfit = summary.refiningProceeds - summary.refiningCost;

  return summary;
}
