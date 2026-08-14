import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptHtml, escapeHtml, maskId, type ReceiptItem } from '../src/lib/receipt.ts';

const item: ReceiptItem = {
  ticket: 'T-1042',
  description: "Ladies' rope chain, broken clasp",
  metal: 'XAU',
  purityId: 'au-14',
  weight: 18.4,
  unit: 'g',
  quantity: 1,
  purchasePrice: 619.83,
  currency: 'USD',
  spotAtPurchase: 2245.22,
  meltAtPurchase: 774.79,
  purchasedAt: '2026-08-05T10:30:00.000Z',
  transactionType: 'purchase',
};

const seller = {
  name: 'Marla Whitfield',
  phone: '555 0142',
  idType: 'drivers_license',
  idNumber: 'W4471209',
};

/* ------------------------------------------------------------------ masking */

test('only the last four digits of an ID are printed', () => {
  const masked = maskId('W4471209');
  assert.ok(masked.endsWith('1209'));
  assert.ok(!masked.includes('W447'), 'the leading characters must not survive');
});

test('a short ID is masked entirely rather than mostly revealed', () => {
  assert.equal(maskId('1234'), '••••');
  assert.equal(maskId('12'), '••');
});

test('a missing ID masks to nothing', () => {
  assert.equal(maskId(undefined), '');
  assert.equal(maskId(''), '');
});

test('whitespace in an ID does not leak extra characters', () => {
  const masked = maskId('W 447 1209');
  assert.ok(masked.endsWith('1209'));
  assert.ok(!masked.includes(' '));
});

/* ---------------------------------------------------------------- escaping */

test('markup in user text is escaped, not rendered', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Smith & Sons'), 'Smith &amp; Sons');
  assert.equal(escapeHtml(undefined), '');
});

test('a description containing markup cannot break the document', () => {
  const html = buildReceiptHtml(
    { ...item, description: '<img src=x onerror="alert(1)">' },
    seller,
  );
  assert.ok(!html.includes('<img src=x'), 'raw tag must not reach the output');
  assert.ok(html.includes('&lt;img'));
});

/* ---------------------------------------------------------------- content */

test('the receipt carries the numbers the customer needs to check', () => {
  const html = buildReceiptHtml(item, seller, { businessName: 'Northgate Gold' });

  assert.ok(html.includes('Northgate Gold'));
  assert.ok(html.includes('T-1042'));
  assert.ok(html.includes('$619.83'), 'the amount paid');
  assert.ok(html.includes('18.4 g'), 'the weight as presented');
  assert.ok(html.includes('14K Gold'));
  assert.ok(html.includes('$2,245.22'), 'the market price used');
  assert.ok(html.includes('Marla Whitfield'));
});

test('the full ID number never appears in the document', () => {
  const html = buildReceiptHtml(item, seller);
  assert.ok(!html.includes('W4471209'), 'the customer copy must not print the whole ID');
  assert.ok(html.includes('1209'), 'but enough to show which document was checked');
});

test('a seller with no details still produces a usable receipt', () => {
  const html = buildReceiptHtml(item, {});
  assert.ok(html.includes('T-1042'));
  assert.ok(html.includes('$619.83'));
  // Empty rows are omitted rather than printed blank.
  assert.ok(!html.includes('<th>Phone</th>'));
  assert.ok(!html.includes('<th>Identification</th>'));
});

test('quantity is shown only when there is more than one piece', () => {
  assert.ok(!buildReceiptHtml(item, seller).includes('× 1'));
  const many = buildReceiptHtml({ ...item, quantity: 12 }, seller);
  assert.ok(many.includes('× 12'));
  assert.ok(many.includes('220.80 g total'), '18.4 g twelve times');
});

test('the gram total is omitted when it repeats the weight already shown', () => {
  // A single item weighed in grams does not need "(18.40 g total)" after it.
  assert.ok(!buildReceiptHtml(item, seller).includes('g total'));
});

test('a non-gram unit still gets the gram total, since the customer may not think in dwt', () => {
  const html = buildReceiptHtml({ ...item, weight: 10, unit: 'dwt' }, seller);
  assert.ok(html.includes('10 dwt'));
  assert.ok(html.includes('15.55 g total'));
});

test('ID types are printed as English, not as enum values', () => {
  const html = buildReceiptHtml(item, seller);
  assert.ok(html.includes("Driver&#39;s licence"));
  assert.ok(!html.includes('drivers_license'));
  assert.ok(!html.includes('drivers license'));
});

test('an unrecognised ID type degrades to a neutral label', () => {
  const html = buildReceiptHtml(item, { ...seller, idType: 'something_new' });
  assert.ok(html.includes('ID '));
  assert.ok(!html.includes('something_new'));
});

test('a non-purchase transaction is titled as what it is', () => {
  const html = buildReceiptHtml({ ...item, transactionType: 'trade' }, seller);
  assert.ok(html.toLowerCase().includes('trade receipt'));
});

test('a custom declaration replaces the default wording', () => {
  const html = buildReceiptHtml(item, seller, { declaration: 'Bespoke local wording.' });
  assert.ok(html.includes('Bespoke local wording.'));
  assert.ok(!html.includes('free of any lien'));
});

test('the document is self-contained, with no external requests', () => {
  const html = buildReceiptHtml(item, seller);
  assert.ok(!/src\s*=\s*["']https?:/i.test(html), 'no remote images');
  assert.ok(!/<link\b/i.test(html), 'no external stylesheets');
  assert.ok(!/<script\b/i.test(html), 'no scripts');
});

test('missing spot and melt figures are simply omitted', () => {
  const html = buildReceiptHtml({ ...item, spotAtPurchase: 0, meltAtPurchase: 0 }, seller);
  assert.ok(!html.includes('Market price used'));
  assert.ok(html.includes('$619.83'), 'the amount paid is still there');
});
