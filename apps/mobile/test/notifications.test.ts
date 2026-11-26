import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processCaptured, processBatch, toRawMessage, type CapturedNotification } from '../src/notifications/process.ts';
import { mergeTransactions } from '../src/transactions.ts';
import { syncGmail, EMPTY_STATE } from '../src/gmail/sync.ts';
import type { GmailClient, GmailMessage } from '../src/gmail/api.ts';

// SYNTHETIC alert text (generic wording) — not any real bank's format.
let seq = 0;
const at = new Date('2026-11-26T12:00:00Z').getTime();
const notif = (packageName: string, title: string | null, text: string, whenMs = at): CapturedNotification =>
  ({ id: `n${++seq}`, packageName, title, text, postedAt: whenMs, key: `k${seq}`, whenMs });

const SMS = 'com.google.android.apps.messaging';

test('bank SMS: sender id is the title, text is parsed', () => {
  const o = processCaptured(notif(SMS, 'BANKX', 'PKR 3,200.00 spent at GUL AHMED on card ending 1234. Avl Bal PKR 40,000.'));
  assert.equal(o.kind, 'transaction');
  if (o.kind !== 'transaction') return;
  assert.equal(o.tx.sender, 'BANKX');
  assert.equal(o.tx.amount, 3200);
  assert.equal(o.tx.category, 'Clothing');
  assert.equal(o.tx.source, 'notification');
  assert.equal(o.tx.occurredAt.getTime(), at);
});

test('wallet app notification: title carries the amount', () => {
  const n = notif('com.example.wallet', 'Rs. 1,500 sent', 'Money transferred to Ali Raza successfully.');
  assert.equal(toRawMessage(n).body, 'Rs. 1,500 sent. Money transferred to Ali Raza successfully.');
  assert.equal(toRawMessage(n).sender, 'com.example.wallet');
  const o = processCaptured(n);
  assert.equal(o.kind, 'transaction');
  if (o.kind === 'transaction') assert.equal(o.tx.amount, 1500);
});

test('personal SMS from a phone number, OTPs and Android-15 redacted alerts are skipped', () => {
  assert.deepEqual(processCaptured(notif(SMS, '+92 300 1234567', 'Bhai Rs 500 sent kar diye')), { kind: 'skipped', id: `n${seq}`, reason: 'personal-sms' });
  assert.equal((processCaptured(notif(SMS, 'BANKX', 'Your OTP for Rs. 2,000 is 123456. Do not share.')) as { reason: string }).reason, 'otp');
  assert.equal((processCaptured(notif(SMS, 'BANKX', 'Sensitive notification content hidden')) as { reason: string }).reason, 'redacted');
});

test('short-code senders are not mistaken for phone numbers', () => {
  assert.equal(processCaptured(notif(SMS, '8287', 'Rs. 750 debited from A/C xx5678 at FOODPANDA.')).kind, 'transaction');
});

test('unparseable money-looking alert is reported for review, everything is acked', () => {
  const items = [
    notif(SMS, 'BANKX', 'Rs. 99 something unusual happened.'),
    notif(SMS, 'BANKX', 'PKR 1,000 debited from A/C xx1234 at KFC.'),
  ];
  const r = processBatch(items);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.unparsed.length, 1);
  assert.deepEqual(r.ackIds, items.map(i => i.id));
});

test('same purchase via SMS notification and Gmail is stored once', async () => {
  const sms = processBatch([notif(SMS, 'BANKX', 'PKR 4,500 spent at KHAADI on card ending 1234.', at)]);
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const email: GmailMessage = {
    id: 'g1', threadId: 'g1', internalDate: String(at + 3 * 60_000),
    payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'alerts@bank.example' }, { name: 'Subject', value: 'Transaction Alert' }], body: { data: b64('Dear customer, PKR 4,500.00 was spent at KHAADI using card ending 1234.') } },
  };
  const gmail: GmailClient = { listMessageIds: async () => ({ ids: ['g1'] }), getMessage: async () => email };
  const fromEmail = await syncGmail({ gmail, state: EMPTY_STATE });

  const stored = mergeTransactions(mergeTransactions([], sms.transactions), fromEmail.transactions);
  assert.equal(stored.length, 1);
});
