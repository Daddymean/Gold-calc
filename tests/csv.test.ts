import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, customersCsv, inventoryCsv } from '../src/lib/csv.ts';

type Item = Parameters<typeof inventoryCsv>[0][number];
type Person = Parameters<typeof customersCsv>[0][number];

const base = {
  id: 'i1',
  ticket: 'T-1',
  description: 'Rope chain',
  metal: 'XAU',
  purityId: 'au-14',
  weight: 20,
  unit: 'g',
  quantity: 1,
  purchasePrice: 500,
  currency: 'USD',
  spotAtPurchase: 2000,
  meltAtPurchase: 750,
  transactionType: 'purchase',
  status: 'in_stock',
  photoUris: [],
  tags: [],
  purchasedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Item;

const item = (patch: Partial<Item> = {}): Item => ({ ...base, ...patch }) as Item;
const spot = { XAU: 2000 };

/** Header row plus the requested data row, split on commas outside quotes. */
function column(csv: string, header: string, row = 1): string {
  const lines = csv.split('\r\n');
  const cells = (line: string) =>
    line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '')) ?? [];
  const index = cells(lines[0]).indexOf(header);
  assert.notEqual(index, -1, `no column named ${header}`);
  return cells(lines[row])[index] ?? '';
}

/* --------------------------------------------------------------- escaping */

test('a value containing a comma or quote cannot break the row', () => {
  assert.equal(csvCell('Smith, Jr'), '"Smith, Jr"');
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
});

test('a cell that would execute as a spreadsheet formula is neutralised', () => {
  // Without this a description field is a way to run code on the accountant's
  // machine when they open the export.
  for (const attack of ['=1+1', '+1', '-1', '@SUM(A1)']) {
    assert.ok(csvCell(attack).startsWith("'"), `${attack} must not stay live`);
  }
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
});

test('empty and missing values export as empty, not as "undefined"', () => {
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(''), '');
});

/* -------------------------------------------------------------- inventory */

test('the export carries the figures a bookkeeper needs', () => {
  const csv = inventoryCsv([item()], spot, 'USD');
  assert.equal(column(csv, 'Ticket'), 'T-1');
  assert.equal(column(csv, 'Purchase price'), '500.00');
  assert.equal(column(csv, 'Currency'), 'USD');
  assert.equal(column(csv, 'Pure grams'), (20 * (14 / 24)).toFixed(3));
});

test('the valuation column names the currency it is quoted in', () => {
  // 'Purchase price' is recorded money and 'Melt now' comes from today's feed.
  // Two money columns in one row must not be assumed to be the same unit.
  const csv = inventoryCsv([item({ currency: 'EUR' } as Partial<Item>)], spot, 'USD');
  assert.equal(column(csv, 'Currency'), 'EUR', 'what was paid');
  assert.equal(column(csv, 'Valued in'), 'USD', 'what it is worth today');
});

test('no gain is printed when cost and value are in different currencies', () => {
  assert.equal(column(inventoryCsv([item({ currency: 'EUR' } as Partial<Item>)], spot, 'USD'), 'Gain'), '');
  assert.notEqual(column(inventoryCsv([item()], spot, 'USD'), 'Gain'), '');
});

test('a description full of punctuation survives the round trip', () => {
  const csv = inventoryCsv(
    [item({ description: 'Ring, 2 stones, "chipped"' } as Partial<Item>)],
    spot,
    'USD',
  );
  assert.equal(csv.split('\r\n').length, 2, 'still one header and one row');
  assert.equal(column(csv, 'Description'), '"Ring, 2 stones, ""chipped"""');
});

/* -------------------------------------------------------------- customers */

test("a customer's totals are grouped by the currency they were paid in", () => {
  const people = [{ id: 'c1', name: 'Marla', createdAt: '2026-01-01T00:00:00.000Z' }] as unknown as Person[];
  const items = [
    item({ id: 'a', customerId: 'c1', purchasePrice: 500 } as Partial<Item>),
    item({ id: 'b', customerId: 'c1', purchasePrice: 300 } as Partial<Item>),
    item({ id: 'c', customerId: 'c1', purchasePrice: 200, currency: 'EUR' } as Partial<Item>),
  ];

  const csv = customersCsv(people, items, 'USD');
  assert.equal(column(csv, 'Transactions'), '3');
  assert.equal(column(csv, 'Total paid'), '800.00', 'the two USD purchases only');
  assert.equal(column(csv, 'Currency'), 'USD');
  assert.equal(column(csv, 'Also paid'), 'EUR 200.00');
});

test('a customer with nothing on the book exports zero, not a blank', () => {
  const people = [{ id: 'c9', name: 'New', createdAt: '2026-01-01T00:00:00.000Z' }] as unknown as Person[];
  const csv = customersCsv(people, [], 'USD');
  assert.equal(column(csv, 'Transactions'), '0');
  assert.equal(column(csv, 'Total paid'), '0.00');
  assert.equal(column(csv, 'Also paid'), '');
});
