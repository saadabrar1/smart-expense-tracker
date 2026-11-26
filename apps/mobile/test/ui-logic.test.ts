import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySpend, nextPayday, dayLabel, warningEnabled } from '../src/insights.ts';
import { pressKey } from '../src/keypad.ts';

const now = new Date(2026, 10, 26, 20, 0); // Thu 26 Nov 2026, 20:00 local
const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();

test('dailySpend: per-day debits, transfers and credits excluded, oldest first', () => {
  const days = dailySpend([
    { amount: 500, direction: 'debit', isTransfer: false, occurredAt: at(26, 9) },
    { amount: 250, direction: 'debit', isTransfer: false, occurredAt: at(26, 19) },
    { amount: 9000, direction: 'debit', isTransfer: true, occurredAt: at(26) },
    { amount: 2000, direction: 'credit', isTransfer: false, occurredAt: at(25) },
    { amount: 1200, direction: 'debit', isTransfer: false, occurredAt: at(20) },
    { amount: 999, direction: 'debit', isTransfer: false, occurredAt: at(10) }, // outside the 7-day window
  ], now, 7);
  assert.equal(days.length, 7);
  assert.equal(days[0].date.getDate(), 20);
  assert.equal(days[0].total, 1200);
  assert.equal(days[6].date.getDate(), 26);
  assert.equal(days[6].total, 750);
  assert.equal(days[5].total, 0);
});

test('nextPayday: later this month, else next month, clamped to short months', () => {
  assert.equal(nextPayday(null, now), null);
  assert.equal(nextPayday(28, now)?.toDateString(), new Date(2026, 10, 28).toDateString());
  assert.equal(nextPayday(1, now)?.toDateString(), new Date(2026, 11, 1).toDateString());
  assert.equal(nextPayday(26, now)?.toDateString(), new Date(2026, 11, 26).toDateString(), 'payday today counts as passed');
  assert.equal(nextPayday(31, new Date(2027, 1, 3))?.toDateString(), new Date(2027, 1, 28).toDateString());
});

test('dayLabel: Today / Yesterday / short date', () => {
  assert.equal(dayLabel(new Date(2026, 10, 26, 1), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 10, 25, 23), now), 'Yesterday');
  assert.match(dayLabel(new Date(2026, 10, 24), now), /24 Nov/);
});

test('warningEnabled maps each warning to its Settings switch', () => {
  const on = { runout: false, pace: true, jump: false };
  assert.equal(warningEnabled({ type: 'low-runway', days: 3 }, on), false);
  assert.equal(warningEnabled({ type: 'pace-up', avgDaily7: 2, avgDaily30: 1, pctAbove: 100 }, on), true);
  assert.equal(warningEnabled({ type: 'category-spike', category: 'Clothing', last7: 5, typicalWeek: 1 }, on), false);
});

test('keypad: digits, one decimal point, two decimals, 9-digit cap, delete', () => {
  const type = (keys: string[]) => keys.reduce(pressKey, '');
  assert.equal(type(['1', '2', '5', '0']), '1250');
  assert.equal(type(['.', '5']), '0.5');
  assert.equal(type(['1', '.', '.', '2', '5', '9']), '1.25');
  assert.equal(type(['0', '7']), '7');
  assert.equal(type('1234567890'.split('')), '123456789');
  assert.equal(type(['4', '2', 'del']), '4');
  assert.equal(type(['del']), '');
});

test('merge on the phone: detailed + short bank e-mails for one own-wallet transfer → one "Transfers" record', async () => {
  const { parseMessage, categorize } = await import('@smart-expense/engine');
  const { mergeTransactions } = await import('../src/transactions.ts');
  const parse = (body: string) => {
    const r = parseMessage({ sender: 'ibanking@bankalfalah.com', body, receivedAt: new Date('2026-11-25T09:20:00Z'), source: 'email' });
    assert.equal(r.kind, 'transaction');
    return categorize((r as { kind: 'transaction'; tx: import('@smart-expense/engine').ParsedTransaction }).tx);
  };
  // Anonymised copies of real Bank Alfalah formats (same Ref = same payment).
  const detailed = parse('Transaction Successful Wednesday, November 25, 2026 | 2:14 PM Ref# FT26329TEST0001 Account Title AHMED KHAN Account/IBAN *****4455 Purpose of Payment Others Transaction Type Debit Tax/Charges PKR 0.0000/- Amount PKR 8,500.00/- call/Whatsapp: 021111225111');
  const short = parse('Dear AHMED KHAN PKR 8,500.00 sent to AHMAD KHAN -RAAST ID **03**-***2233 on 25-Nov-2026 14:14 Ref FT26329TEST0001 via RAAST');
  assert.equal(detailed.category, 'Other');
  const stored = mergeTransactions(mergeTransactions([], [detailed]), [short]);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].isTransfer, true);
  assert.equal(stored[0].category, 'Transfers');
  assert.equal(stored[0].accountHint, '4455');
});
