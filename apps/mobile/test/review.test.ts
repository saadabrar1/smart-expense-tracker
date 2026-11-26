import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, guessFromText, validateFix, transactionFromFix, buildSampleMailUrl } from '../src/review/review.ts';
import type { UnparsedAlert } from '../src/gmail/sync.ts';

test('redact: removes personal identifiers, keeps amounts, dates and last 4 digits', () => {
  const input = [
    'Dear Muhammad Ali Raza, Rs 150000 received in A/C 0123456789012 on 26-11-2026.',
    'IBAN PK36SCBL0000001123456702, CNIC 35202-1234567-1, call 0300-1234567 or +92 321 7654321.',
    'Card 4123 4567 8901 2345. Ref 998877665544. Mail help@bank.example. Fee PKR 25.',
  ].join(' ');
  const out = redact(input);

  assert.match(out, /Dear \[name\],/);
  assert.doesNotMatch(out, /Raza|Muhammad/);
  assert.match(out, /Rs 150000 received/, 'amount after currency is kept');
  assert.match(out, /A\/C ••••9012/);
  assert.match(out, /on 26-11-2026/, 'dates are kept');
  assert.match(out, /IBAN PK••••6702/);
  assert.match(out, /CNIC \[cnic\]/);
  assert.match(out, /call \[phone\] or \[phone\]/);
  assert.match(out, /Card ••••2345/);
  assert.match(out, /Ref ••••5544/);
  assert.match(out, /Mail \[email\]/);
  assert.match(out, /Fee PKR 25/);
});

test('redact: generic greetings are left alone', () => {
  assert.equal(redact('Dear Customer, your payment is due.'), 'Dear Customer, your payment is due.');
  assert.equal(redact('Dear Valued Member, hi'), 'Dear Valued Member, hi');
});

test('guessFromText prefills amount and direction', () => {
  assert.deepEqual(guessFromText('Funds of PKR 12,500.50 have been deposited'), { amount: 12500.5, direction: 'credit' });
  assert.deepEqual(guessFromText('Rs.799 for your bundle'), { amount: 799, direction: 'debit' });
  assert.deepEqual(guessFromText('no amount here'), { amount: null, direction: 'debit' });
});

test('validateFix', () => {
  assert.equal(validateFix({ amount: null, merchant: '' }), 'Enter the amount');
  assert.equal(validateFix({ amount: 0, merchant: '' }), 'Enter the amount');
  assert.equal(validateFix({ amount: NaN, merchant: '' }), 'Enter the amount');
  assert.equal(validateFix({ amount: 500, merchant: '' }), null);
});

const alert: UnparsedAlert = {
  id: 'a1', source: 'notification', from: 'BANKX', subject: null,
  text: 'Rs.799 for your bundle', receivedAt: Date.parse('2026-11-20T10:00:00Z'), reason: 'failed',
};

test('transactionFromFix uses the user\'s values with full confidence', () => {
  const t = transactionFromFix(alert, { amount: 799, direction: 'debit', merchant: ' Zong ', category: 'Mobile & Internet' });
  assert.equal(t.amount, 799);
  assert.equal(t.merchant, 'Zong');
  assert.equal(t.category, 'Mobile & Internet');
  assert.equal(t.categorizedBy, 'user-rule');
  assert.equal(t.confidence, 1);
  assert.equal(t.occurredAt.toISOString(), '2026-11-20T10:00:00.000Z');
  assert.equal(t.isTransfer, false);
  assert.equal(transactionFromFix(alert, { amount: 5, direction: 'debit', merchant: '', category: 'Transfers' }).isTransfer, true);
});

test('buildSampleMailUrl encodes a reviewable draft', () => {
  const url = buildSampleMailUrl({ to: 'samples@yourapp.example', sender: 'BANKX', source: 'notification', text: 'Rs 5 & more\nline 2', appVersion: '1.0.0' });
  assert.ok(url.startsWith('mailto:samples%40yourapp.example?subject=Unsupported%20alert%3A%20BANKX&body='));
  const body = decodeURIComponent(url.split('&body=')[1]);
  assert.match(body, /^Sender: BANKX\nChannel: SMS \/ app notification\nApp version: 1\.0\.0\n/);
  assert.match(body, /Rs 5 & more\nline 2$/);
});
