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
 * Separators are genuinely ambiguous across locales, so the rules are explicit:
 * when both `.` and `,` appear the last one is the decimal mark and the other
 * is grouping; a lone separator followed by exactly three digits is grouping
 * ("1,250" is twelve hundred and fifty, not 1.25); anything else is a decimal
 * mark, so a European "12,5" still reads as 12.5.
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
    const isGrouping = tail.length === 3 && head.length > 0 && !tail.includes(mark);
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
