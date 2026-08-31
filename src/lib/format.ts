/** Display formatting. Kept separate from the math so rounding never leaks in. */

export type CurrencyCode = 'USD' | 'CAD' | 'GBP' | 'EUR' | 'AUD' | 'INR';

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'CAD', symbol: '$', label: 'Canadian Dollar' },
  { code: 'GBP', symbol: '£', label: 'Pound Sterling' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'AUD', symbol: '$', label: 'Australian Dollar' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
];

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '$';
}

export function money(value: number, code: CurrencyCode = 'USD', digits = 2): string {
  if (!Number.isFinite(value)) return `${currencySymbol(code)}0.00`;
  const abs = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value < 0 ? '-' : ''}${currencySymbol(code)}${abs}`;
}

/** Spot moves in cents; sub-dollar metals like silver need more resolution. */
export function spotMoney(value: number, code: CurrencyCode = 'USD'): string {
  return money(value, code, value < 100 ? 3 : 2);
}

export function weight(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function percent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '0%';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function signedPercent(fraction: number, digits = 2): string {
  const sign = fraction > 0 ? '+' : '';
  return `${sign}${(fraction * 100).toFixed(digits)}%`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 min ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Parses what people actually type: "12.5", "12,5", "$1,250.75", " 12 ".
 *
 * Separators are ambiguous across locales, so the rules are explicit, in order:
 *
 *  1. Both marks present — the last one is the decimal, the other is grouping.
 *     "1,250.75" and "1.250,75" are both 1250.75.
 *  2. The same mark twice or more — grouping, because no number has two
 *     decimal points. "1.250.000" is a million and a quarter.
 *  3. A lone comma with exactly three digits after it — grouping. "1,250" is
 *     twelve hundred and fifty, not 1.25.
 *  4. Anything else is a decimal mark, so "12,5" reads as 12.5.
 *
 * Rule 3 deliberately does not apply to a lone dot, and that asymmetry is the
 * whole point. This app writes money as "$1,250.75", so the dot it shows the
 * operator is a decimal point and the dot they type back is one too. Treating
 * "31.103" as grouping — which is what a symmetric rule does — turns a Silver
 * Eagle into 31 kilos of silver and a 0.715 factor into 715. Scales read to
 * three decimals, so that shape is the common case, not the corner one.
 *
 * The cost is that a European typing "1.250" for 1250 gets 1.25. They are
 * typing a grouping separator into a numeric field by hand, which is rare, and
 * the melt value in front of them will be off by a thousand.
 */
export function parseNumber(input: string): number {
  if (!input) return 0;

  const cleaned = input.replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;

  const negative = cleaned.startsWith('-');
  const digitsOnly = cleaned.replace(/-/g, '');

  const lastDot = digitsOnly.lastIndexOf('.');
  const lastComma = digitsOnly.lastIndexOf(',');

  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const grouping = decimalAt === lastDot ? ',' : '.';
    normalized =
      digitsOnly.slice(0, decimalAt).split(grouping).join('') +
      '.' +
      digitsOnly.slice(decimalAt + 1).replace(/[.,]/g, '');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? '.' : ',';
    const at = Math.max(lastDot, lastComma);
    const tail = digitsOnly.slice(at + 1);
    const head = digitsOnly.slice(0, at);
    const repeated = head.includes(mark);
    const isGrouping =
      repeated || (mark === ',' && tail.length === 3 && head.length > 0);
    normalized = isGrouping
      ? digitsOnly.split(mark).join('')
      : `${head.split(mark).join('')}.${tail.split(mark).join('')}`;
  } else {
    normalized = digitsOnly;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}
