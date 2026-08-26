// Relative imports with an explicit extension: this module is exercised by the
// node test runner, which does not resolve the bundler's '@/' path alias.
import { METALS, findPurity, ratePerWeight, toGrams, type WeightUnit } from './metals.ts';
import { money, shortDate, type CurrencyCode } from './format.ts';

/**
 * The customer's copy.
 *
 * A dealer keeps the record; the person who walked in gets nothing unless the
 * app produces it. This builds that document as self-contained HTML, which
 * expo-print turns into a PDF or sends to a printer.
 *
 * Two things it deliberately does NOT do. It does not print the seller's full
 * ID number — the shop needs that on file, the customer's copy does not, and a
 * receipt left on a counter should not be an identity document. And it makes no
 * claim to satisfy any particular jurisdiction's rules: it is a sensible
 * template, and the wording is the operator's to check.
 */

export interface ReceiptItem {
  ticket: string;
  description: string;
  metal: keyof typeof METALS;
  purityId: string;
  weight: number;
  unit: WeightUnit;
  quantity: number;
  purchasePrice: number;
  currency: CurrencyCode;
  spotAtPurchase: number;
  meltAtPurchase: number;
  purchasedAt: string;
  transactionType: string;
}

export interface ReceiptSeller {
  name?: string;
  phone?: string;
  address?: string;
  idType?: string;
  idNumber?: string;
}

export interface ReceiptOptions {
  businessName?: string;
  /** Shown under the seller's signature line. Defaults to a neutral wording. */
  declaration?: string;
  /**
   * True when the seller details passed in are the ones recorded at the time of
   * sale rather than the customer's current record. Only then may the document
   * claim the identification was verified that day.
   */
  sellerAsRecorded?: boolean;
}

/** Enum values are for the database; a receipt gets readable English. */
const ID_TYPE_LABELS: Record<string, string> = {
  drivers_license: "Driver's licence",
  state_id: 'State ID',
  passport: 'Passport',
  military_id: 'Military ID',
  other: 'ID',
};

const DEFAULT_DECLARATION =
  'I certify that the property described above is mine to sell, that it is free of any lien or claim, and that the information I have given is true.';

/** Escapes text so a description containing < or & cannot break the document. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shows only enough of an ID to prove which document was checked.
 *
 * The full number stays in the shop's encrypted record. Printing it would put a
 * customer's licence number on a piece of paper that then lives in a coat
 * pocket, a bin, or a car.
 */
export function maskId(idNumber?: string): string {
  const clean = String(idNumber ?? '').replace(/\s/g, '');
  if (!clean) return '';
  if (clean.length <= 4) return '•'.repeat(clean.length);
  return `${'•'.repeat(Math.min(8, clean.length - 4))}${clean.slice(-4)}`;
}

/**
 * The gram total is only worth printing when it says something the first figure
 * does not — several pieces, or a unit the customer may not think in.
 */
function weightLine(item: ReceiptItem, grams: number): string {
  const base = `${item.weight} ${item.unit}`;
  const many = item.quantity > 1 ? `${base} × ${item.quantity}` : base;
  const needsTotal = item.quantity > 1 || item.unit !== 'g';
  return needsTotal ? `${many} (${grams.toFixed(2)} g total)` : many;
}

function row(label: string, value: string): string {
  if (!value) return '';
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function buildReceiptHtml(
  item: ReceiptItem,
  seller: ReceiptSeller,
  options: ReceiptOptions = {},
): string {
  const meta = METALS[item.metal];
  const purity = findPurity(item.purityId);
  const grams = toGrams(item.weight, item.unit) * (item.quantity || 1);
  const business = options.businessName?.trim() || 'Precious metals purchase';
  const declaration = options.declaration?.trim() || DEFAULT_DECLARATION;

  const rates = ratePerWeight(item.purchasePrice, grams);
  const isPurchase = item.transactionType === 'purchase';
  const title = isPurchase ? 'Purchase receipt' : `${item.transactionType} receipt`;
  const paidLabel = isPurchase ? 'Amount paid to you' : 'Amount';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(item.ticket)} — ${escapeHtml(business)}</title>
<style>
  /* Print-first: black on white, generous margins, no colour dependency. */
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111; background: #fff; margin: 0; padding: 0 4mm;
    font-size: 12pt; line-height: 1.45;
  }
  header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
  .business { font-size: 17pt; font-weight: 700; letter-spacing: -0.2px; }
  .doc { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; }
  .doc .title { font-size: 12pt; text-transform: uppercase; letter-spacing: 1.2px; }
  .doc .ticket { font-size: 13pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  h2 {
    font-size: 9pt; text-transform: uppercase; letter-spacing: 1.4px;
    color: #555; margin: 22px 0 6px; font-weight: 700;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 0; vertical-align: top; }
  th { width: 42%; font-weight: 400; color: #555; }
  td { font-variant-numeric: tabular-nums; }
  .total { border-top: 1.5px solid #111; margin-top: 10px; padding-top: 10px;
           display: flex; justify-content: space-between; align-items: baseline; }
  .total .label { font-size: 11pt; }
  .total .value { font-size: 20pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .total .rate { display: block; font-size: 9.5pt; font-weight: 400; color: #555;
                 font-variant-numeric: tabular-nums; margin-top: 2px; }
  .declaration { margin-top: 26px; font-size: 10pt; line-height: 1.5; }
  .sign { margin-top: 26px; display: flex; gap: 26px; }
  .sign div { flex: 1; }
  .rule { border-bottom: 1px solid #111; height: 30px; }
  .caption { font-size: 8.5pt; color: #555; margin-top: 4px; }
  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc;
           font-size: 8.5pt; color: #555; }
</style></head>
<body>
  <header>
    <div class="business">${escapeHtml(business)}</div>
    <div class="doc">
      <span class="title">${escapeHtml(title)}</span>
      <span class="ticket">${escapeHtml(item.ticket)}</span>
    </div>
  </header>

  <h2>Transaction</h2>
  <table>
    ${row('Date', shortDate(item.purchasedAt))}
    ${row('Reference', item.ticket)}
  </table>

  <h2>Item received</h2>
  <table>
    ${row('Description', item.description)}
    ${row('Metal', `${purity?.label ?? ''} ${meta?.name ?? ''}`.trim())}
    ${row('Weight', weightLine(item, grams))}
    ${item.spotAtPurchase ? row('Market price used', `${money(item.spotAtPurchase, item.currency)} per troy ounce`) : ''}
    ${item.meltAtPurchase ? row('Metal value at that price', money(item.meltAtPurchase, item.currency)) : ''}
  </table>

  <div class="total">
    <span class="label">${escapeHtml(paidLabel)}</span>
    <span class="value">${escapeHtml(money(item.purchasePrice, item.currency))}
      ${
        // The rate is the figure a seller repeats to the next shop, and the one
        // they use to check this deal against the last. Cheaper to print it
        // than to have them work it out in the car park.
        rates.perGram
          ? `<span class="rate">${escapeHtml(money(rates.perGram, item.currency))} per gram · ${escapeHtml(money(rates.perTroyOz, item.currency, 0))} per troy ounce</span>`
          : ''
      }
    </span>
  </div>

  <h2>Seller</h2>
  <table>
    ${row('Name', seller.name ?? '')}
    ${row('Phone', seller.phone ?? '')}
    ${row('Address', seller.address ?? '')}
    ${row(
      'Identification',
      seller.idNumber
        ? `${seller.idType ? `${ID_TYPE_LABELS[seller.idType] ?? 'ID'} ` : ''}${maskId(seller.idNumber)}`
        : '',
    )}
  </table>

  <p class="declaration">${escapeHtml(declaration)}</p>

  <div class="sign">
    <div>
      <div class="rule"></div>
      <div class="caption">Seller signature</div>
    </div>
    <div>
      <div class="rule"></div>
      <div class="caption">Date</div>
    </div>
  </div>

  <footer>
    Customer copy — please retain for your records.
    ${
      seller.idNumber
        ? options.sellerAsRecorded
          ? 'Identification was verified at the time of sale; only the last digits are shown here.'
          : 'Seller details are shown as currently on file, not as recorded at the time of sale.'
        : ''
    }
  </footer>
</body></html>`;
}
