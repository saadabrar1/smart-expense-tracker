import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMessage, dedupeKey, categorize, learnRule, computeInsight, describeWarning,
  type RawMessage, type Template, type CategorizedTransaction, type ParsedTransaction,
} from '../src/index.ts';

// SYNTHETIC fixtures in generic alert wording — NOT copies of any real bank's format.
// Replace/extend with anonymised real samples collected in Phase 0 (gate G2).
const at = new Date('2026-11-26T14:00:00+05:00');
const msg = (body: string, sender = 'BANK'): RawMessage => ({ sender, body, receivedAt: at, source: 'notification' });

function tx(r: ReturnType<typeof parseMessage>): ParsedTransaction {
  assert.equal(r.kind, 'transaction', `expected a transaction, got ${JSON.stringify(r)}`);
  return (r as { tx: ParsedTransaction }).tx;
}

test('card purchase: amount, merchant, balance, account', () => {
  const t = tx(parseMessage(msg('PKR 4,500.00 spent at KHAADI DOLMEN MALL on card ending 1234. Avl Bal PKR 52,300.50')));
  assert.equal(t.amount, 4500);
  assert.equal(t.direction, 'debit');
  assert.equal(t.merchant, 'KHAADI DOLMEN MALL');
  assert.equal(t.balance, 52300.5);
  assert.equal(t.accountHint, '1234');
});

test('balance amount is never taken as the transaction amount', () => {
  const t = tx(parseMessage(msg('Avl Bal Rs. 10,000. Rs. 750 debited from A/C xx5678 at FOODPANDA.')));
  assert.equal(t.amount, 750);
  assert.equal(t.balance, 10000);
});

test('credit / salary', () => {
  const t = tx(parseMessage(msg('Your A/C xx5678 has been credited with Rs 150,000 salary from ACME PVT LTD.')));
  assert.equal(t.direction, 'credit');
  assert.equal(t.amount, 150000);
});

test('wallet top-up is a transfer, not spending', () => {
  const t = tx(parseMessage(msg('Rs. 5,000 transferred to your wallet top-up from A/C xx5678.')));
  assert.equal(t.isTransfer, true);
  assert.equal(categorize(t).category, 'Transfers');
});

test('OTP and promo messages are ignored', () => {
  assert.deepEqual(parseMessage(msg('Your OTP for payment of Rs. 2,000 is 482913. Do not share.')), { kind: 'ignored', reason: 'otp' });
  assert.deepEqual(parseMessage(msg('Mega SALE! Get 20% discount on Rs. 5000 shopping. Click here')), { kind: 'ignored', reason: 'promo' });
  assert.deepEqual(parseMessage(msg('Your appointment is confirmed for tomorrow.')), { kind: 'ignored', reason: 'not-financial' });
});

test('sender template wins over heuristic with high confidence', () => {
  const tpl: Template = {
    id: 'example-wallet-sent',
    sender: /^EXAMPLEPAY$/i,
    pattern: /You sent Rs\.?(?<amount>[\d,.]+) to (?<merchant>.+?)\. Balance: Rs\.?(?<balance>[\d,.]+)/,
    direction: 'debit',
  };
  const t = tx(parseMessage(msg('You sent Rs.1,200 to Ali Raza. Balance: Rs.8,800', 'EXAMPLEPAY'), [tpl]));
  assert.equal(t.parsedBy, 'example-wallet-sent');
  assert.equal(t.amount, 1200);
  assert.equal(t.merchant, 'Ali Raza');
  assert.ok(t.confidence > 0.9);
});

test('same alert via notification and email dedupes to one key', () => {
  const a = tx(parseMessage(msg('PKR 4,500 spent at KHAADI on card ending 1234.')));
  const b = tx(parseMessage({ ...msg('Dear customer, PKR 4,500.00 was spent at KHAADI using card ending 1234.'), source: 'email', receivedAt: new Date(at.getTime() + 2 * 60_000) }));
  assert.equal(dedupeKey(a), dedupeKey(b));
});

test('categoriser: dictionary, keyword, fallback, and learning from corrections', () => {
  const base = tx(parseMessage(msg('PKR 3,000 spent at GUL AHMED IDEAS on card ending 1234.')));
  assert.equal(categorize(base).category, 'Clothing');

  const unknown = { ...base, merchant: 'ZAINAB TRADERS' };
  assert.equal(categorize(unknown).category, 'Other');

  const rules = learnRule(new Map(), 'Zainab Traders', 'Groceries');
  const c = categorize(unknown, rules);
  assert.equal(c.category, 'Groceries');
  assert.equal(c.categorizedBy, 'user-rule');

  assert.equal(categorize({ ...base, merchant: 'Bundu Khan Restaurant' }).category, 'Food & Dining');
  assert.equal(categorize({ ...base, merchant: 'JazzCash' }).category, 'Other', 'wallet names must not be mistaken for a mobile bill');
});

test('forecast: daily averages, runway, run-out-before-payday and pace warnings', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-11-26T20:00:00+05:00');
  const mk = (daysAgo: number, amount: number, category = 'Food & Dining'): CategorizedTransaction => ({
    amount, currency: 'PKR', direction: 'debit', merchant: 'X', balance: null, accountHint: null, isTransfer: false,
    occurredAt: new Date(now.getTime() - daysAgo * DAY), sender: 'BANK', source: 'notification',
    parsedBy: 'test', confidence: 1, category, categorizedBy: 'dictionary',
  });

  // 30 days of Rs 1,000/day, then the last 7 days at Rs 2,000/day plus a clothing splurge.
  const txs: CategorizedTransaction[] = [];
  for (let d = 29; d >= 7; d--) txs.push(mk(d + 0.1, 1000));
  for (let d = 6; d >= 0; d--) txs.push(mk(d + 0.1, 2000));
  txs.push(mk(1, 12000, 'Clothing'));
  txs.push(mk(29.5, 1000, 'Clothing'));
  // A transfer must not count as spending.
  txs.push({ ...mk(0.05, 50000), isTransfer: true, category: 'Transfers' });

  const ins = computeInsight(txs, { now, balance: 40000, nextIncomeOn: new Date('2026-12-01T09:00:00+05:00') });

  assert.equal(Math.round(ins.avgDaily7), Math.round((7 * 2000 + 12000) / 7));
  assert.ok(ins.avgDaily30 > 1000 && ins.avgDaily30 < ins.avgDaily7);
  assert.equal(ins.byCategory[0].category, 'Food & Dining');
  assert.equal(ins.runwayDays, Math.floor(40000 / ins.avgDaily7));
  assert.ok(ins.safeToSpendPerDay! > 0);

  const types = ins.warnings.map(w => w.type);
  assert.ok(types.includes('pace-up'), `warnings: ${types}`);
  assert.ok(types.includes('category-spike'), `warnings: ${types}`);
  for (const w of ins.warnings) assert.ok(describeWarning(w).length > 10);
});

test('forecast: new account averages over days actually covered', () => {
  const now = new Date('2026-11-26T20:00:00+05:00');
  const t: CategorizedTransaction = {
    amount: 3000, currency: 'PKR', direction: 'debit', merchant: 'X', balance: 9000, accountHint: null, isTransfer: false,
    occurredAt: new Date(now.getTime() - 2.5 * 86_400_000), sender: 'B', source: 'manual', parsedBy: 'manual',
    confidence: 1, category: 'Other', categorizedBy: 'fallback',
  };
  const ins = computeInsight([t], { now });
  assert.equal(ins.avgDaily30, 1000); // 3000 over 3 covered days, not 30
  assert.equal(ins.runwayDays, 9); // balance read from the latest alert
});
