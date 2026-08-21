import test from 'node:test';
import assert from 'node:assert/strict';
import { expiredIdPhotoOwners, itemsUnderHold } from '../src/lib/retention.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-08T12:00:00Z');

const customer = (id: string, daysAgo: number, hasPhoto = true) => ({
  id,
  idPhotoUri: hasPhoto ? `file:///photos/${id}.jpg` : undefined,
  createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
});

test('retention off keeps everything', () => {
  const customers = [customer('a', 400), customer('b', 1)];
  assert.deepEqual(expiredIdPhotoOwners(customers, 0, NOW), []);
  assert.deepEqual(expiredIdPhotoOwners(customers, -5, NOW), []);
});

test('only photos past the window are swept', () => {
  const customers = [customer('old', 100), customer('fresh', 10)];
  assert.deepEqual(expiredIdPhotoOwners(customers, 90, NOW), ['old']);
});

test('a customer with no ID photo is never listed', () => {
  const customers = [customer('nophoto', 999, false)];
  assert.deepEqual(expiredIdPhotoOwners(customers, 30, NOW), []);
});

test('the boundary day is not swept early', () => {
  // Exactly at the cutoff is still inside the window; a moment older is not.
  assert.deepEqual(expiredIdPhotoOwners([customer('edge', 30)], 30, NOW), []);
  const justOver = [{ ...customer('edge', 30), createdAt: new Date(NOW - 30 * DAY - 1).toISOString() }];
  assert.deepEqual(expiredIdPhotoOwners(justOver, 30, NOW), ['edge']);
});

test('an unparseable capture date is treated as expired', () => {
  // An ID image whose age cannot be established is exactly the one not to keep.
  const broken = [{ id: 'x', idPhotoUri: 'file:///photos/x.jpg', createdAt: 'not a date' }];
  assert.deepEqual(expiredIdPhotoOwners(broken, 30, NOW), ['x']);
});

test('an empty book sweeps nothing', () => {
  assert.deepEqual(expiredIdPhotoOwners([], 30, NOW), []);
});

/* ------------------------------------------------------------ hold period */


const stock = (id: string, daysAgo: number, status = 'in_stock') => ({
  id,
  purchasedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  status,
});

test('no hold period holds nothing', () => {
  assert.deepEqual(itemsUnderHold([stock('a', 1)], 0, NOW), []);
});

test('items bought inside the window are held', () => {
  const items = [stock('fresh', 3), stock('old', 40)];
  assert.deepEqual(itemsUnderHold(items, 30, NOW), ['fresh']);
});

test('sold and melted items are past holding', () => {
  const items = [stock('sold', 1, 'sold'), stock('melted', 1, 'melted'), stock('held', 1)];
  assert.deepEqual(itemsUnderHold(items, 30, NOW), ['held']);
});

test('an item exactly at the cutoff has cleared the hold', () => {
  assert.deepEqual(itemsUnderHold([stock('edge', 30)], 30, NOW), []);
});

test('an unparseable purchase date cannot be shown to have cleared', () => {
  const broken = [{ id: 'x', purchasedAt: 'not a date', status: 'in_stock' }];
  assert.deepEqual(itemsUnderHold(broken, 30, NOW), ['x']);
});
