import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_BYTES,
  NONCE_BYTES,
  base64ToBytes,
  bytesToBase64,
  isEnvelope,
  open,
  seal,
} from '../src/lib/crypto/envelope.ts';

const key = (fill: number) => new Uint8Array(KEY_BYTES).fill(fill);
const nonce = (fill: number) => new Uint8Array(NONCE_BYTES).fill(fill);

/* ----------------------------------------------------------------- base64 */

test('base64 round-trips arbitrary bytes, including every byte value', () => {
  const all = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(base64ToBytes(bytesToBase64(all)), all);
});

test('base64 handles every padding case', () => {
  for (const length of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 37) % 256);
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes, `length ${length}`);
  }
});

test('base64 output matches the platform encoder', () => {
  const bytes = new Uint8Array([0, 1, 250, 255, 128, 64, 32]);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
});

/* --------------------------------------------------------------- envelope */

test('a sealed envelope opens back to the original text', () => {
  const secret = JSON.stringify({ name: 'Jordan Ellis', idNumber: 'D1234567' });
  const sealed = seal(secret, key(7), nonce(1));
  assert.equal(open(sealed, key(7)), secret);
});

test('the ciphertext does not leak the plaintext', () => {
  const sealed = seal('driver licence D1234567', key(7), nonce(1));
  assert.ok(!sealed.includes('D1234567'));
  assert.ok(!sealed.includes('licence'));
});

test('unicode survives the round trip', () => {
  const text = '18K — Ünïcode ✓ 金 ₹1,250.75';
  assert.equal(open(seal(text, key(3), nonce(9)), key(3)), text);
});

test('empty strings round-trip', () => {
  assert.equal(open(seal('', key(3), nonce(9)), key(3)), '');
});

test('a large book round-trips', () => {
  const big = JSON.stringify(
    Array.from({ length: 2000 }, (_, i) => ({ ticket: `T-${i}`, note: 'chain, broken clasp' })),
  );
  assert.equal(open(seal(big, key(5), nonce(2)), key(5)), big);
});

/* ------------------------------------------------------------ it must fail */

test('the wrong key fails to open rather than returning garbage', () => {
  const sealed = seal('secret', key(7), nonce(1));
  assert.throws(() => open(sealed, key(8)));
});

test('a tampered ciphertext is rejected', () => {
  const sealed = seal('pay the customer $619.83', key(7), nonce(1));
  const parts = sealed.split('.');
  const bytes = base64ToBytes(parts[2]);
  bytes[0] ^= 0xff;
  assert.throws(() => open(`${parts[0]}.${parts[1]}.${bytesToBase64(bytes)}`, key(7)));
});

test('a truncated envelope is rejected', () => {
  const sealed = seal('secret', key(7), nonce(1));
  assert.throws(() => open(sealed.slice(0, sealed.length - 6), key(7)));
});

test('malformed envelopes are rejected', () => {
  assert.throws(() => open('bb1.only-two-parts', key(7)));
  assert.throws(() => open('plain json {}', key(7)));
  // A short nonce must be caught before it reaches the cipher.
  assert.throws(() => open(`bb1.${bytesToBase64(new Uint8Array(8))}.AAAA`, key(7)));
});

test('seal rejects wrong-sized keys and nonces', () => {
  assert.throws(() => seal('x', new Uint8Array(16), nonce(1)));
  assert.throws(() => seal('x', key(7), new Uint8Array(12)));
});

/* -------------------------------------------------------------- detection */

test('envelopes are distinguishable from legacy plaintext', () => {
  assert.ok(isEnvelope(seal('{}', key(1), nonce(1))));
  assert.ok(!isEnvelope('{"items":[]}'));
  assert.ok(!isEnvelope('[]'));
  assert.ok(!isEnvelope(''));
});

test('reusing a nonce with the same key produces identical output', () => {
  // Documents why the key manager must draw a fresh random nonce per write:
  // repeating one leaks that two records are identical.
  const a = seal('same', key(4), nonce(6));
  const b = seal('same', key(4), nonce(6));
  assert.equal(a, b);
});
