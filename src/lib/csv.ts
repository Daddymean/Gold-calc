// Relative with an explicit extension: exercised by the node test runner, which
// does not resolve the bundler's '@/' alias. Type-only imports are erased.
import { METALS, findPurity, toGrams } from './metals.ts';
import { valueItem } from './portfolio.ts';
import type { CurrencyCode } from '@/lib/format';
import type { Customer, InventoryItem, MetalSymbol } from '@/types';

/**
 * CSV export.
 *
 * A dealer's book has to leave the phone eventually — for the accountant, for
 * an insurer, or for a regulator asking who sold you what. Plain CSV opens
 * anywhere and needs no account.
 *
 * Pure on purpose, with the file writing and share sheet next door in
 * `export.ts`, so the document these people rely on can be tested without a
 * device. Every money column names its own currency: a spreadsheet that adds a
 * EUR purchase to a USD one is a wrong answer nobody would catch by eye.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Escape by RFC 4180: wrap in quotes and double any internal quote. Also
  // neutralise leading =/+/-/@ so a description can't execute in a spreadsheet.
  const needsQuotes = /[",\n\r]/.test(text);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return needsQuotes ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function inventoryCsv(
  items: InventoryItem[],
  spot: Partial<Record<MetalSymbol, number>>,
  displayCurrency: CurrencyCode,
): string {
  const headers = [
    'Ticket',
    'Purchased',
    'Description',
    'Metal',
    'Purity',
    'Fineness',
    'Weight',
    'Unit',
    'Grams',
    'Quantity',
    'Pure grams',
    'Purchase price',
    'Currency',
    'Spot at purchase',
    'Melt at purchase',
    'Melt now',
    'Valued in',
    'Gain',
    'Status',
    'Sale price',
    'Sold at',
    'Transaction',
    'Customer',
    'Location',
    'Tags',
    'Photos',
    'Notes',
  ];

  const rows = items.map((item) => {
    const purity = findPurity(item.purityId);
    const valuation = valueItem(item, spot, displayCurrency);
    return [
      item.ticket,
      item.purchasedAt.slice(0, 10),
      item.description,
      METALS[item.metal].name,
      purity?.label ?? '',
      purity ? purity.fineness.toFixed(4) : '',
      item.weight,
      item.unit,
      toGrams(item.weight, item.unit).toFixed(3),
      item.quantity,
      valuation.pureGrams.toFixed(3),
      item.purchasePrice.toFixed(2),
      item.currency,
      item.spotAtPurchase.toFixed(2),
      item.meltAtPurchase.toFixed(2),
      valuation.meltNow.toFixed(2),
      // 'Melt now' comes from today's feed, so it is in the display currency
      // whatever the item was bought in. Naming it here stops the two money
      // columns from being read as the same unit.
      displayCurrency,
      // A gain across two currencies is not a number. Left empty rather than
      // printed as a subtraction the reader would trust.
      valuation.comparable ? valuation.gain.toFixed(2) : '',
      item.status,
      item.salePrice?.toFixed(2) ?? '',
      item.soldAt?.slice(0, 10) ?? '',
      item.transactionType,
      item.customerName ?? '',
      item.location ?? '',
      item.tags.join(' '),
      item.photoUris.length,
      item.notes ?? '',
    ];
  });

  return toCsv(headers, rows);
}

export function customersCsv(
  customers: Customer[],
  items: InventoryItem[],
  displayCurrency: CurrencyCode,
): string {
  const headers = [
    'Name',
    'Phone',
    'Email',
    'Address',
    'ID type',
    'ID number',
    'ID expiry',
    'Date of birth',
    'Transactions',
    'Total paid',
    'Currency',
    'Also paid',
    'First seen',
    'Notes',
  ];

  const rows = customers.map((customer) => {
    const theirs = items.filter((i) => i.customerId === customer.id);

    // Totalled per currency. Anything outside the display currency goes in its
    // own cell rather than being folded into a single meaningless sum.
    const byCurrency = new Map<string, number>();
    for (const item of theirs) {
      byCurrency.set(item.currency, (byCurrency.get(item.currency) ?? 0) + item.purchasePrice);
    }
    const primary = byCurrency.get(displayCurrency) ?? 0;
    const others = [...byCurrency.entries()]
      .filter(([code]) => code !== displayCurrency)
      .map(([code, total]) => `${code} ${total.toFixed(2)}`)
      .join('; ');

    return [
      customer.name,
      customer.phone ?? '',
      customer.email ?? '',
      customer.address ?? '',
      customer.idType ?? '',
      customer.idNumber ?? '',
      customer.idExpiry ?? '',
      customer.dateOfBirth ?? '',
      theirs.length,
      primary.toFixed(2),
      displayCurrency,
      others,
      customer.createdAt.slice(0, 10),
      customer.notes ?? '',
    ];
  });

  return toCsv(headers, rows);
}
