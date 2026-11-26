import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMessage, parsePkDate, isSameName, isSameTransaction, combineCopies, markOwnTransfers, categorize,
  type RawMessage, type ParsedTransaction,
} from '../src/index.ts';

/*
 * Fixtures copy the EXACT layout of real alerts collected on 2026-11-26 (Easypaisa e-mail,
 * Bank Alfalah e-mails). Names, phone/account numbers and reference ids are REPLACED with
 * made-up values; amounts, dates and wording are kept.
 */

const EASYPAISA_TRANSFER = `Transaction Successful

Hi AHMAD KHAN,

Money Transfer of Rs. 580.0 on 26-Nov-2026 to Easypaisa was successful

TRANSACTION DETAILS
Transaction Type    Money Transfer to Easypaisa
Transaction ID    51000000001
Date & Time    26-Nov-2026 14:11:05
Sender Name    AHMAD KHAN
Sender Number    03001112233
Receiver Name    BILAL AHMED
Receiver Number    03119998877
AMOUNT DETAILS
Transfer amount    Rs. 580.0
Fee    Rs. 0.00
Total    Rs. 580.0
For any queries, please call the Easypaisa helpline on 3737, 111-003-737 or send an email to complaints@telenorbank.pk
Disclaimer:
This message contains confidential and proprietary information and is intended for the individual addressed only.`;

const EASYPAISA_PACKAGE = `Transaction Successful

Hi AHMAD KHAN,

Weekly EasyCard AJK GB for 03450001111 on 24-Nov-2026 has been successfully subscribed

TRANSACTION DETAILS
Transaction Type    Mobile Package
Transaction ID    51000000002
Date & Time    24-Nov-2026 19:58:31
Sender Name    AHMAD KHAN
Sender Number    03001112233
Receiver Number    03450001111
AMOUNT DETAILS
Transfer amount    Rs. 440.0
Fee    Rs. 1.00
Total    Rs. 441.0
For any queries, please call the Easypaisa helpline on 3737, 111-003-737 or send an email to complaints@telenorbank.pk`;

const ALFALAH_DETAILED = `Transaction Successful

Wednesday, November 25, 2026 | 2:14 PM

Ref# FT26329TEST0001

Account Title

AHMED KHAN

Account/IBAN

*****4455

Purpose of Payment

Others

Transaction Type

Debit

Tax/Charges

PKR 0.0000/-

Orbits

-

Available Balance

Type 'AB' & send SMS to 8287

Amount

PKR 8,500.00/-

Get exclusive updates, exciting offers, and the latest features—right at your fingertips!
Join our WhatsApp Channel today and stay connected:
For queries or assistance, please call/Whatsapp: 021111225111`;

// The real samples spell the same person differently at the bank (AHMED) and the wallet (AHMAD).
const alfalahShort = (amount: string, to: string, wallet: string, when: string, ref: string) =>
  `Dear AHMED KHAN PKR ${amount} sent to ${to} -RAAST ID **03**-***${wallet} on ${when} Ref ${ref} via RAAST`;

const EP = 'e.statement@telenorbank.pk';
const ALF = 'ibanking@bankalfalah.com';
const msg = (sender: string, body: string, receivedAt = new Date('2026-11-26T15:00:00Z')): RawMessage => ({ sender, body, receivedAt, source: 'email' });
const one = (s: string) => s.replace(/\s+/g, ' ');

function tx(m: RawMessage): ParsedTransaction {
  const r = parseMessage(m);
  assert.equal(r.kind, 'transaction', `expected a transaction: ${JSON.stringify(r)}`);
  return (r as { tx: ParsedTransaction }).tx;
}

test('parsePkDate: alert-local Pakistan time → UTC', () => {
  assert.equal(parsePkDate('26-Nov-2026 14:11:05')?.toISOString(), '2026-11-26T09:11:05.000Z');
  assert.equal(parsePkDate('on 25-Nov-2026 09:17 Ref')?.toISOString(), '2026-11-25T04:17:00.000Z');
  assert.equal(parsePkDate('Wednesday, November 25, 2026 | 2:14 PM')?.toISOString(), '2026-11-25T09:14:00.000Z');
  assert.equal(parsePkDate('November 3, 2026 | 12:05 AM')?.toISOString(), '2026-11-02T19:05:00.000Z');
  assert.equal(parsePkDate('26/11/2026 14:11')?.toISOString(), '2026-11-26T09:11:00.000Z');
  assert.equal(parsePkDate('no date here'), null);
});

test('isSameName: tolerant to one-letter spelling differences, strict otherwise', () => {
  assert.equal(isSameName('AHMED KHAN', 'AHMAD KHAN'), true);
  assert.equal(isSameName('Sara Ahmed', 'SARA AHMAD'), true);
  assert.equal(isSameName('AHMED KHAN', 'BILAL AHMED'), false);
  assert.equal(isSameName('ALI KHAN', 'ALI KHAN TAREEN'), false);
  assert.equal(isSameName('ALI', 'ALY'), false, 'short parts must match exactly');
});

for (const [label, shape] of [['multi-line', (s: string) => s], ['one-line (HTML e-mail)', one]] as const) {
  test(`Easypaisa transfer to a person (${label})`, () => {
    const t = tx(msg(EP, shape(EASYPAISA_TRANSFER)));
    assert.equal(t.parsedBy, 'pk.easypaisa.email.transaction-details');
    assert.equal(t.amount, 580);
    assert.equal(t.direction, 'debit');
    assert.equal(t.merchant, 'BILAL AHMED');
    assert.equal(t.accountHint, '2233');
    assert.equal(t.counterpartyHint, '8877');
    assert.equal(t.reference, '51000000001');
    assert.equal(t.isTransfer, false, 'paying another person is spending');
    assert.equal(t.occurredAt.toISOString(), '2026-11-26T09:11:05.000Z', 'uses the alert time, not arrival');
  });

  test(`Easypaisa mobile package: total incl. fee, Mobile & Internet (${label})`, () => {
    const t = tx(msg(EP, shape(EASYPAISA_PACKAGE)));
    assert.equal(t.amount, 441);
    assert.equal(t.merchant, 'Mobile Package');
    assert.equal(t.counterpartyHint, null, 'a topped-up phone number is not an own account');
    assert.equal(categorize(t).category, 'Mobile & Internet');
  });

  test(`Bank Alfalah detailed e-mail despite marketing footer (${label})`, () => {
    const t = tx(msg(ALF, shape(ALFALAH_DETAILED)));
    assert.equal(t.parsedBy, 'pk.alfalah.email.transaction');
    assert.equal(t.amount, 8500);
    assert.equal(t.direction, 'debit');
    assert.equal(t.accountHint, '4455');
    assert.equal(t.reference, 'FT26329TEST0001');
    assert.equal(t.occurredAt.toISOString(), '2026-11-25T09:14:00.000Z');
  });
}

test('Bank Alfalah RAAST to own wallet (name spelled differently) is a transfer', () => {
  const t = tx(msg(ALF, alfalahShort('8,500.00', 'AHMAD KHAN', '2233', '25-Nov-2026 14:14', 'FT26329TEST0001')));
  assert.equal(t.parsedBy, 'pk.alfalah.sent');
  assert.equal(t.amount, 8500);
  assert.equal(t.isTransfer, true);
  assert.equal(t.counterpartyHint, '2233');
  assert.equal(categorize(t).category, 'Transfers');
});

test('Bank Alfalah RAAST to someone else is spending', () => {
  const t = tx(msg(ALF, alfalahShort('350.00', 'USMAN TARIQ', '7777', '24-Nov-2026 16:22', 'FT26328TEST0002')));
  assert.equal(t.isTransfer, false);
  assert.equal(t.merchant, 'USMAN TARIQ');
  assert.equal(t.amount, 350);
});

test('detailed + short Alfalah e-mails for one payment → one transaction with the best of both', () => {
  const detailed = tx(msg(ALF, ALFALAH_DETAILED));
  const short = tx(msg(ALF, alfalahShort('8,500.00', 'AHMAD KHAN', '2233', '25-Nov-2026 14:14', 'FT26329TEST0001')));
  assert.equal(isSameTransaction(detailed, short), true);
  const merged = combineCopies(detailed, short);
  assert.equal(merged.accountHint, '4455');
  assert.equal(merged.merchant, 'AHMAD KHAN');
  assert.equal(merged.isTransfer, true);

  const other = tx(msg(ALF, alfalahShort('8,500.00', 'USMAN TARIQ', '7777', '25-Nov-2026 14:16', 'FT26329TEST0009')));
  assert.equal(isSameTransaction(short, other), false, 'different references = different payments, even 2 minutes apart');
});

test('markOwnTransfers: money sent to an account the user also sends from', () => {
  const wallet = tx(msg(EP, EASYPAISA_TRANSFER)); // shows own wallet …2233 as sender
  const toNickname = tx(msg(ALF, alfalahShort('400.00', 'MY WALLET', '2233', '24-Nov-2026 19:56', 'FT26328TEST0003')));
  assert.equal(toNickname.isTransfer, false, 'name alone does not reveal it');
  const [, marked] = markOwnTransfers([wallet, toNickname]);
  assert.equal(marked.isTransfer, true);
  const unchanged = [wallet];
  assert.equal(markOwnTransfers(unchanged), unchanged, 'same array when nothing changes');
});
