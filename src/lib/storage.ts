import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Customer, InventoryItem, PriceHistory, Settings, SpotQuote } from '@/types';

/**
 * Everything lives on the device. A buyer's book and their customers' ID
 * details are not data to ship to a server by default, and the app has to keep
 * working in a basement shop with no signal.
 */

const KEYS = {
  items: 'bb:items:v1',
  customers: 'bb:customers:v1',
  settings: 'bb:settings:v1',
  quotes: 'bb:quotes:v1',
  history: 'bb:history:v1',
  ticketSeq: 'bb:ticketSeq:v1',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  defaultPayoutRate: 0.8,
  defaultUnit: 'g',
  defaultMetal: 'XAU',
  businessName: '',
  requireCustomerId: true,
  holdPeriodDays: 0,
  spotProvider: 'demo',
  spotApiKey: '',
  refreshMinutes: 15,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt blob should degrade to empty rather than wedge the app on boot.
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  loadItems: () => readJson<InventoryItem[]>(KEYS.items, []),
  saveItems: (items: InventoryItem[]) => writeJson(KEYS.items, items),

  loadCustomers: () => readJson<Customer[]>(KEYS.customers, []),
  saveCustomers: (customers: Customer[]) => writeJson(KEYS.customers, customers),

  async loadSettings(): Promise<Settings> {
    const stored = await readJson<Partial<Settings>>(KEYS.settings, {});
    // Merge so a settings field added in a later version gets its default
    // instead of arriving undefined in the UI.
    return { ...DEFAULT_SETTINGS, ...stored };
  },
  saveSettings: (settings: Settings) => writeJson(KEYS.settings, settings),

  loadQuotes: () => readJson<SpotQuote[]>(KEYS.quotes, []),
  saveQuotes: (quotes: SpotQuote[]) => writeJson(KEYS.quotes, quotes),

  loadHistory: () => readJson<Record<string, PriceHistory>>(KEYS.history, {}),
  saveHistory: (history: Record<string, PriceHistory>) => writeJson(KEYS.history, history),

  /** Monotonic ticket numbers so two items never share a counter reference. */
  async nextTicket(): Promise<string> {
    const raw = await AsyncStorage.getItem(KEYS.ticketSeq);
    const next = (Number.parseInt(raw ?? '0', 10) || 0) + 1;
    await AsyncStorage.setItem(KEYS.ticketSeq, String(next));
    return `T-${String(next).padStart(4, '0')}`;
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

/** RFC4122-ish id. Good enough for local records; no crypto dependency needed. */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
