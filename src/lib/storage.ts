import AsyncStorage from '@react-native-async-storage/async-storage';
import { decryptString, destroyMasterKey, encryptString, isEnvelope } from '@/lib/crypto';
import type { BuyRule, Customer, InventoryItem, PriceHistory, Settings, SpotQuote } from '@/types';

/**
 * Everything lives on the device, sealed with the device's master key. A
 * customer's driver's licence number is not data to ship to a server by
 * default, and the app has to keep working in a basement shop with no signal.
 *
 * Records written before encryption existed are plain JSON; they are read as-is
 * and sealed the next time they are written, so upgrading loses nothing.
 */

const KEYS = {
  items: 'bb:items:v1',
  customers: 'bb:customers:v1',
  settings: 'bb:settings:v1',
  quotes: 'bb:quotes:v1',
  history: 'bb:history:v1',
  buyRules: 'bb:buyRules:v1',
  ticketSeq: 'bb:ticketSeq:v1',
} as const;

/** Values that are neither sensitive nor worth the round trip to seal. */
const UNENCRYPTED_KEYS: string[] = [KEYS.ticketSeq];

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
  useBuyTable: true,
  appLockEnabled: false,
  idPhotoRetentionDays: 0,
};

/**
 * Raised when stored data exists but cannot be opened — a keystore failure, a
 * restored backup whose key did not come with it, or a corrupt envelope.
 *
 * This must never be swallowed into an empty book. Showing "no items" and then
 * saving over the top would destroy a dealer's records; the app blocks writes
 * and surfaces the problem instead.
 */
export class VaultUnreadableError extends Error {
  constructor(readonly storageKey: string, cause?: unknown) {
    super('Stored data could not be decrypted.');
    this.name = 'VaultUnreadableError';
    this.cause = cause;
  }
}

/** Latched once a read fails, so nothing can overwrite data we could not read. */
let writesBlocked = false;

export function areWritesBlocked(): boolean {
  return writesBlocked;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;

  let plaintext: string;
  if (isEnvelope(raw)) {
    try {
      plaintext = await decryptString(raw);
    } catch (err) {
      writesBlocked = true;
      throw new VaultUnreadableError(key, err);
    }
  } else {
    plaintext = raw;
  }

  try {
    return JSON.parse(plaintext) as T;
  } catch {
    // Legacy plaintext that was already corrupt: degrade to empty rather than
    // wedging the app on boot. Nothing was decryptable to lose here.
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  if (writesBlocked) {
    throw new VaultUnreadableError(key);
  }
  const json = JSON.stringify(value);
  const payload = UNENCRYPTED_KEYS.includes(key) ? json : await encryptString(json);
  await AsyncStorage.setItem(key, payload);
}

export const storage = {
  loadItems: () => readJson<InventoryItem[]>(KEYS.items, []),
  saveItems: (items: InventoryItem[]) => writeJson(KEYS.items, items),

  loadCustomers: () => readJson<Customer[]>(KEYS.customers, []),
  saveCustomers: (customers: Customer[]) => writeJson(KEYS.customers, customers),

  loadBuyRules: () => readJson<BuyRule[]>(KEYS.buyRules, []),
  saveBuyRules: (rules: BuyRule[]) => writeJson(KEYS.buyRules, rules),

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

  /**
   * Wipes the book and the key that opens it. Destroying the key matters: any
   * copy of the data that survives in a device backup stays unreadable.
   */
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
    await destroyMasterKey();
    writesBlocked = false;
  },
};

/** RFC4122-ish id. Good enough for local records; no crypto dependency needed. */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
