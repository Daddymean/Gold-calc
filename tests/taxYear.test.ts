import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableYears,
  realisedEvents,
  summariseYear,
  yearOf,
} from '../src/lib/taxYear.ts';

type Item = Parameters<typeof realisedEvents>[0][number];
type Lot = Parameters<typeof realisedEvents>[1][number];

const item = (patch: Partial<Item> = {}): Item =>
  ({
    id: 'i1',
    ticket: 'T-1',
    description: 'Chain',
    metal: 'XAU',
    purityId: 'au-14',
    weight: 10,
    unit: 'g',
    quantity: 1,
    purchasePrice: 400,
    currency: 'USD',
    spotAtPurchase: 2000,
    meltAtPurchase: 500,
    transactionType: 'purchase',
    status: 'in_stock',
    photoUris: [],
    tags: [],
    purchasedAt: '2026-01-05T00:00:00.000Z',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    ...patch,
  }) as unknown as Item;

const sold = (patch: Partial<Item> = {}): Item =>
  item({ status: 'sold', salePrice: 600, soldAt: '2026-03-10T00:00:00.000Z', ...patch } as Partial<Item>);

const lot = (patch: Partial<Lot> = {}): Lot =>
  ({
    id: 'l1',
    reference: 'L-0001',
    refinerName: 'Meridian',
    itemIds: [],
    status: 'settled',
    costBasis: 1000,
    currency: 'USD',
    assayLines: [],
    fees: { refining: 0, assay: 0, shipping: 0, other: 0 },
    actualPayout: 1250,
    createdAt: '2026-02-01T00:00:00.000Z',
    settledAt: '2026-04-02T00:00:00.000Z',
    ...patch,
  }) as unknown as Lot;

/* ------------------------------------------------------------ what realises */

test('a sale realises on the day it sold, not the day it was bought', () => {
  // Cost follows the event that realised it, so a piece bought in one year and
  // sold in the next is entirely a second-year event.
  const [event] = realisedEvents([sold({ purchasedAt: '2025-11-01T00:00:00.000Z' } as Partial<Item>)], []);
  assert.equal(event.date, '2026-03-10T00:00:00.000Z');
  assert.equal(event.proceeds, 600);
  assert.equal(event.cost, 400);
  assert.equal(event.profit, 200);
  assert.equal(event.kind, 'sale');
});

test('a settled lot realises on the settlement date', () => {
  const [event] = realisedEvents([], [lot()]);
  assert.equal(event.kind, 'refining');
  assert.equal(event.date, '2026-04-02T00:00:00.000Z');
  assert.equal(event.proceeds, 1250);
  assert.equal(event.cost, 1000);
  assert.equal(event.profit, 250);
  assert.equal(event.reference, 'L-0001');
});

test('stock still on the shelf is not income', () => {
  // However much it has appreciated. Unrealised gains are not realised.
  assert.equal(realisedEvents([item(), item({ status: 'on_hold' } as Partial<Item>)], []).length, 0);
});

test('lots still at the refiner are not income either', () => {
  assert.equal(realisedEvents([], [lot({ status: 'sent' } as Partial<Lot>)]).length, 0);
  assert.equal(realisedEvents([], [lot({ status: 'open' } as Partial<Lot>)]).length, 0);
});

test('a melted item is not counted alongside the lot that contains it', () => {
  // Its outcome is the lot's; counting both would book the same purchase twice.
  const events = realisedEvents([item({ status: 'melted' } as Partial<Item>)], [lot()]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'refining');
});

test('a sale with no recorded price is not invented', () => {
  const events = realisedEvents([item({ status: 'sold', soldAt: '2026-03-10T00:00:00.000Z' } as Partial<Item>)], []);
  assert.equal(events.length, 0);
});

test('events come back newest first', () => {
  const events = realisedEvents([sold()], [lot()]);
  assert.equal(events[0].date, '2026-04-02T00:00:00.000Z');
  assert.equal(events[1].date, '2026-03-10T00:00:00.000Z');
});

/* ------------------------------------------------------------------ years */

test('years are listed newest first, and only where something happened', () => {
  const events = realisedEvents(
    [sold({ id: 'a', soldAt: '2024-06-01T00:00:00.000Z' } as Partial<Item>), sold({ id: 'b' })],
    [lot()],
  );
  assert.deepEqual(availableYears(events), [2026, 2024]);
});

test('an unreadable date does not become a year', () => {
  assert.equal(yearOf('not a date'), null);
  assert.equal(yearOf(undefined), null);
});

/* ---------------------------------------------------------------- the year */

test('the year totals proceeds, cost and profit', () => {
  const events = realisedEvents([sold()], [lot()]);
  const year = summariseYear(events, 2026, 'USD');

  assert.equal(year.proceeds, 1850);
  assert.equal(year.cost, 1400);
  assert.equal(year.profit, 450);
  assert.equal(year.events.length, 2);
});

test('sales and refining are reported separately as well as together', () => {
  const year = summariseYear(realisedEvents([sold()], [lot()]), 2026, 'USD');
  assert.equal(year.salesProfit, 200);
  assert.equal(year.refiningProfit, 250);
  assert.equal(year.salesProfit + year.refiningProfit, year.profit);
});

test('another year is not in this year', () => {
  const events = realisedEvents([sold({ soldAt: '2025-12-31T23:00:00.000Z' } as Partial<Item>)], []);
  assert.equal(summariseYear(events, 2026, 'USD').events.length, 0);
  assert.equal(summariseYear(events, 2025, 'USD').events.length, 1);
});

test('a bad batch reduces the year and is counted on its own', () => {
  // "sometimes when the batch is bad" — the loss has to survive into the
  // report, both in the total and as something you can see separately.
  const bad = lot({ id: 'l2', reference: 'L-0002', costBasis: 5000, actualPayout: 4100 } as Partial<Lot>);
  const year = summariseYear(realisedEvents([], [lot(), bad]), 2026, 'USD');

  assert.equal(year.profit, 250 - 900);
  assert.equal(year.losingCount, 1);
  assert.equal(year.losses, -900);
});

test('a profitable year still reports its losing lots', () => {
  // Netting them away hides the reason to change refiner.
  const bad = lot({ id: 'l2', costBasis: 200, actualPayout: 150 } as Partial<Lot>);
  const year = summariseYear(realisedEvents([sold()], [lot(), bad]), 2026, 'USD');
  assert.ok(year.profit > 0);
  assert.equal(year.losingCount, 1);
  assert.equal(year.losses, -50);
});

test('a year with nothing in it reports zeroes rather than failing', () => {
  const year = summariseYear([], 2026, 'USD');
  assert.equal(year.proceeds, 0);
  assert.equal(year.profit, 0);
  assert.equal(year.events.length, 0);
});

/* ------------------------------------------------------------- currency */

test('events in another currency are named, not converted', () => {
  // There is no FX rate for the day each one realised, so adding them would
  // produce a total no accountant could stand behind.
  const events = realisedEvents([sold({ currency: 'EUR' } as Partial<Item>)], [lot()]);
  const year = summariseYear(events, 2026, 'USD');

  assert.equal(year.events.length, 1, 'only the USD lot is totalled');
  assert.equal(year.profit, 250);
  assert.equal(year.excluded.length, 1);
  assert.equal(year.excluded[0].currency, 'EUR');
});

test('a report run in the other currency picks up the other half', () => {
  const events = realisedEvents([sold({ currency: 'EUR' } as Partial<Item>)], [lot()]);
  const year = summariseYear(events, 2026, 'EUR');
  assert.equal(year.profit, 200);
  assert.equal(year.excluded.length, 1);
});
