import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import {
  KEY_BYTES,
  NONCE_BYTES,
  base64ToBytes,
  bytesToBase64,
  isEnvelope,
  open,
  seal,
} from './envelope';

export { isEnvelope } from './envelope';

/**
 * Master key management.
 *
 * One random 32-byte key lives in the platform keystore (iOS Keychain / Android
 * Keystore-backed EncryptedSharedPreferences). Everything the app persists is
 * sealed with it, so a filesystem dump — an unencrypted backup, a rooted phone,
 * a forensic image — yields ciphertext instead of a customer's licence number.
 *
 * Two deliberate choices worth not undoing:
 *
 * The key is NOT bound to biometrics. Android invalidates Keystore entries that
 * require authentication whenever the user enrols a new fingerprint or face,
 * which would permanently destroy the book. The optional app lock is a separate
 * gate on top; losing it never costs data.
 *
 * The key is stored WHEN_UNLOCKED rather than *_THIS_DEVICE_ONLY, so a keychain
 * migration to a new phone carries it across. Device-only storage would be
 * marginally stronger and would silently make every backup unopenable, which
 * for a dealer's book is the worse failure.
 */

const KEY_ALIAS = 'bb.masterKey.v1';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

let cachedKey: Uint8Array | null = null;

/** True on platforms with no keystore — web, where SecureStore is unavailable. */
export function isSecureStorageAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

async function readStoredKey(): Promise<Uint8Array | null> {
  try {
    const stored = await SecureStore.getItemAsync(KEY_ALIAS, SECURE_OPTIONS);
    if (!stored) return null;
    const bytes = base64ToBytes(stored);
    return bytes.length === KEY_BYTES ? bytes : null;
  } catch {
    // A keystore that refuses to answer must not be treated as "no key yet" —
    // generating a replacement would orphan every existing record.
    throw new Error('The device keystore could not be read.');
  }
}

/**
 * Returns the master key, creating one on first run.
 *
 * On web there is no keystore, so this returns null and storage falls back to
 * plaintext. That is only ever the browser preview; the shipped iOS and Android
 * apps always have somewhere safe to put a key.
 */
export async function getMasterKey(): Promise<Uint8Array | null> {
  if (cachedKey) return cachedKey;
  if (!isSecureStorageAvailable()) return null;

  const existing = await readStoredKey();
  if (existing) {
    cachedKey = existing;
    return cachedKey;
  }

  const fresh = Crypto.getRandomBytes(KEY_BYTES);
  await SecureStore.setItemAsync(KEY_ALIAS, bytesToBase64(fresh), SECURE_OPTIONS);
  cachedKey = fresh;
  return cachedKey;
}

/** Forgets the in-memory copy. The stored key is untouched. */
export function forgetCachedKey(): void {
  cachedKey = null;
}

/**
 * Destroys the master key, which makes every sealed record permanently
 * unreadable. Only the "erase all data" path should call this.
 */
export async function destroyMasterKey(): Promise<void> {
  cachedKey = null;
  if (!isSecureStorageAvailable()) return;
  await SecureStore.deleteItemAsync(KEY_ALIAS, SECURE_OPTIONS).catch(() => {});
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getMasterKey();
  if (!key) return plaintext;
  // A fresh random nonce per write: reusing one under the same key would reveal
  // that two records are byte-identical.
  return seal(plaintext, key, Crypto.getRandomBytes(NONCE_BYTES));
}

/**
 * Opens a stored value. Legacy plaintext written before encryption existed is
 * passed straight through so an upgrade does not lose the book; `storage`
 * re-seals it on the next write.
 */
export async function decryptString(stored: string): Promise<string> {
  if (!isEnvelope(stored)) return stored;

  const key = await getMasterKey();
  if (!key) throw new Error('This data is encrypted but no key is available.');
  return open(stored, key);
}
