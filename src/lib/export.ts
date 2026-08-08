import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { METALS, findPurity, toGrams } from '@/lib/metals';
import { valueItem } from '@/lib/portfolio';
import type { Customer, InventoryItem, MetalSymbol } from '@/types';

/**
 * CSV export.
 *
 * A dealer's book has to leave the phone eventually — for the accountant, for
 * an insurer, or for a regulator asking who sold you what. Plain CSV opens
 * anywhere and needs no account.
 */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Escape by RFC 4180: wrap in quotes and double any internal quote. Also
  // neutralise leading =/+/-/@ so a description can't execute in a spreadsheet.
  const needsQuotes = /[",\n\r]/.test(text);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return needsQuotes ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function inventoryCsv(
  items: InventoryItem[],
  spot: Partial<Record<MetalSymbol, number>>,
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
    const valuation = valueItem(item, spot);
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
      valuation.gain.toFixed(2),
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

export function customersCsv(customers: Customer[], items: InventoryItem[]): string {
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
    'First seen',
    'Notes',
  ];

  const rows = customers.map((customer) => {
    const theirs = items.filter((i) => i.customerId === customer.id);
    const total = theirs.reduce((sum, i) => sum + i.purchasePrice, 0);
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
      total.toFixed(2),
      customer.createdAt.slice(0, 10),
      customer.notes ?? '',
    ];
  });

  return toCsv(headers, rows);
}

/** Writes the CSV to a temp file and hands it to the OS share sheet. */
export async function shareCsv(filename: string, contents: string): Promise<void> {
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: filename,
    UTI: 'public.comma-separated-values-text',
  });
}
