import type { ParsedTransaction, RawMessage } from './types.ts';
import { parsePkDate } from './dates.ts';

/**
 * Generic reader for "label → value" alerts (the table-style e-mails most Pakistani banks and
 * wallets send), so a new layout is understood without a bank-specific template.
 *
 * Works on collapsed text (HTML tables flattened to one line): finds every known label, and a
 * label's value is the text up to the next known label or section heading. Longest labels are
 * tried first, so "Total Amount" wins over "Amount".
 */

type Field = 'total' | 'amount' | 'fee' | 'merchant' | 'bankCategory' | 'type' | 'ref' | 'date' | 'channel' | 'account' | 'balance' | 'stop';

const LABELS: [string, Field][] = [
  ['Total Amount', 'total'], ['Total Amount Debited', 'total'], ['Total', 'total'],
  ['Transaction Amount', 'amount'], ['Transfer Amount', 'amount'], ['Amount Debited', 'amount'], ['Amount Credited', 'amount'],
  ['Bill Amount', 'amount'], ['Amount', 'amount'],
  ['Service Fee (Incl. Tax)', 'fee'], ['Service Fee', 'fee'], ['Tax/Charges', 'fee'], ['Charges', 'fee'], ['Fee', 'fee'],
  ['Merchant Details', 'merchant'], ['Merchant Name', 'merchant'], ['Beneficiary Name', 'merchant'], ['Receiver Name', 'merchant'],
  ['Paid To', 'merchant'], ['Biller Name', 'merchant'], ['Merchant', 'merchant'],
  ['Merchant Category', 'bankCategory'],
  ['Type of Transaction', 'type'], ['Transaction Type', 'type'],
  ['Transaction ID', 'ref'], ['Transaction Reference', 'ref'], ['Reference No', 'ref'], ['Reference Number', 'ref'], ['Ref#', 'ref'], ['RRN', 'ref'], ['STAN', 'ref'],
  ['Date & Time', 'date'], ['Transaction Date', 'date'], ['Date and Time', 'date'],
  ['Channel', 'channel'],
  ['Account/IBAN', 'account'], ['Account Number', 'account'], ['Card Number', 'account'], ['From Account', 'account'],
  ['Available Balance', 'balance'], ['Remaining Balance', 'balance'],
  // Section headings / footers end the previous value.
  ['AMOUNT DETAILS', 'stop'], ['TRANSACTION DETAILS', 'stop'], ['ADDITIONAL INFORMATION', 'stop'], ['View your transactions', 'stop'],
  ['For any queries', 'stop'], ['Purpose of Payment', 'stop'], ['Sender Name', 'stop'], ['Sender Number', 'stop'], ['Receiver Number', 'stop'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
const LABEL_RE = new RegExp(
  // \b (not lookbehind): Hermes on older React Native lacks lookbehind support.
  String.raw`\b(` + [...LABELS].sort((a, b) => b[0].length - a[0].length).map(([l]) => escape(l)).join('|') + String.raw`)(?![A-Za-z])\s*:?`,
  'gi',
);
const FIELD_BY_LABEL = new Map(LABELS.map(([l, f]) => [l.toLowerCase().replace(/\s+/g, ' '), f]));

const NUMBER = /(?:PKR|Rs\.?|RS)?\s*(-?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i;
const CREDIT_HINT = /\b(received|credited|cash\s?in|incoming|deposit|refund|reversal)\b/i;

export interface LabelledFields {
  [k: string]: string | undefined;
}

/** All recognised label → value pairs (first occurrence of each field wins). */
export function readLabelledFields(text: string): LabelledFields {
  const flat = text.replace(/\s+/g, ' ');
  const hits = [...flat.matchAll(LABEL_RE)];
  const out: LabelledFields = {};
  hits.forEach((h, i) => {
    const field = FIELD_BY_LABEL.get(h[1].toLowerCase().replace(/\s+/g, ' '));
    if (!field || field === 'stop' || out[field] !== undefined) return;
    const end = i + 1 < hits.length ? hits[i + 1].index : flat.length;
    const value = flat.slice(h.index + h[0].length, end).trim().replace(/^[:\-–]\s*/, '');
    if (value) out[field] = value.slice(0, 120);
  });
  return out;
}

function amountOf(v: string | undefined): number | null {
  const m = v ? NUMBER.exec(v) : null;
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseLabelled(msg: RawMessage): ParsedTransaction | null {
  const f = readLabelledFields(msg.body);
  const amount = amountOf(f.total) ?? amountOf(f.amount);
  // Need an amount plus at least one more identifying field, or it isn't a structured alert.
  const support = ['merchant', 'ref', 'type', 'bankCategory', 'channel', 'account'].filter(k => f[k]).length;
  if (amount == null || support < 2) return null;

  const typeText = `${f.type ?? ''} ${msg.body.slice(0, 200)}`;
  const direction = CREDIT_HINT.test(typeText) && !/-\s*Rs\.?\s*\d/i.test(msg.body) ? 'credit' : 'debit';
  const account = f.account?.match(/(\d{4})\D*$/)?.[1] ?? null;

  return {
    amount,
    currency: 'PKR',
    direction,
    merchant: f.merchant?.replace(/\s+/g, ' ').trim() || null,
    balance: amountOf(f.balance),
    accountHint: account,
    isTransfer: false,
    reference: f.ref?.split(' ')[0] ?? null,
    counterpartyHint: null,
    bankCategory: f.bankCategory ?? null,
    occurredAt: (f.date && parsePkDate(f.date)) || parsePkDate(msg.body) || msg.receivedAt,
    sender: msg.sender,
    source: msg.source,
    parsedBy: 'labelled',
    confidence: f.merchant ? 0.88 : 0.8,
  };
}
