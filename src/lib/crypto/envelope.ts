import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';

/**
 * The pure half of encryption at rest: turn a string into a sealed envelope and
 * back, given a key. It knows nothing about the keychain or the filesystem, so
 * it runs in plain node and is unit tested there.
 *
 * XChaCha20-Poly1305 is an AEAD: the ciphertext carries an authentication tag,
 * so a tampered or truncated blob fails to open rather than decrypting to
 * garbage that looks like an inventory record. The 24-byte nonce is large
 * enough that generating one at random per write has no practical collision
 * risk, which avoids having to persist a counter.
 */

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;

/** Envelope prefix. Bump the number if the scheme ever changes. */
const PREFIX = 'bb1';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 without Buffer or atob: React Native's global support for both is
 * inconsistent across engines, and hex would inflate the stored book by 2x.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);

  let byte = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = B64.indexOf(clean[i]);
    if (value < 0) continue;
    byte = (byte << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (byte >> bits) & 0xff;
    }
  }
  return out.subarray(0, index);
}

/** True when a stored value is one of our envelopes rather than legacy plaintext. */
export function isEnvelope(value: string): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}.`);
}

export function seal(plaintext: string, key: Uint8Array, nonce: Uint8Array): string {
  if (key.length !== KEY_BYTES) throw new Error(`Key must be ${KEY_BYTES} bytes`);
  if (nonce.length !== NONCE_BYTES) throw new Error(`Nonce must be ${NONCE_BYTES} bytes`);

  const cipher = xchacha20poly1305(key, nonce);
  const sealed = cipher.encrypt(utf8ToBytes(plaintext));
  return `${PREFIX}.${bytesToBase64(nonce)}.${bytesToBase64(sealed)}`;
}

/**
 * Opens an envelope. Throws on a wrong key, a corrupt blob or a malformed
 * envelope — callers decide whether that means "migrate" or "refuse to load",
 * and must never silently substitute empty data for a book that failed to open.
 */
export function open(envelope: string, key: Uint8Array): string {
  if (!isEnvelope(envelope)) throw new Error('Not an encrypted envelope');

  const parts = envelope.split('.');
  if (parts.length !== 3) throw new Error('Malformed envelope');

  const nonce = base64ToBytes(parts[1]);
  const sealed = base64ToBytes(parts[2]);
  if (nonce.length !== NONCE_BYTES) throw new Error('Malformed envelope nonce');

  const cipher = xchacha20poly1305(key, nonce);
  return bytesToUtf8(cipher.decrypt(sealed));
}
