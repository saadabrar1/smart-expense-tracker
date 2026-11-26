import { categorize, type Category, type CategorizedTransaction, type Direction } from '@smart-expense/engine';
import type { UnparsedAlert } from '../gmail/sync.ts';

/**
 * "Help us support this bank" — pure helpers (no React Native), tested under node.
 */

const CURRENCY_BEFORE = /(PKR|Rs\.?|RS)\s?$/i;
const DATE_LIKE = /^\d{1,2}[-\s]\d{1,2}[-\s]\d{2,4}$/;
const GENERIC_GREETING = /^(customer|valued|sir|madam|client|member|user|account ?holder|card ?holder)\b/i;

/**
 * Remove personal details before a sample is shared. Keeps what we need to write a parser
 * (wording, amounts, dates, last 4 digits of numbers). The user still reviews and can edit
 * the result, because names and free text can't be removed reliably.
 */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\bPK\d{2}[A-Z]{4}\d{16}\b/gi, m => `PK••••${m.slice(-4)}`)
    .replace(/\b\d{5}-\d{7}-\d\b/g, '[cnic]')
    .replace(/(?:\+92[\s-]?|\b0)3\d{2}[\s-]?\d{7}\b/g, '[phone]')
    .replace(
      /\bDear\s+(?:(?:Mr|Ms|Mrs|Miss)\.?\s+)?([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/g,
      (m, name: string) => (GENERIC_GREETING.test(name) ? m : 'Dear [name]'),
    )
    .replace(/\d[\d\s-]{4,}\d/g, (m, offset: number, all: string) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 6) return m; // short numbers (amounts like 1,500 are split by commas anyway)
      if (DATE_LIKE.test(m)) return m;
      if (CURRENCY_BEFORE.test(all.slice(Math.max(0, offset - 6), offset))) return m; // an amount: keep
      return `••••${digits.slice(-4)}`; // account / card / reference: keep last 4 for matching
    });
}

const AMOUNT = /(?:PKR|Rs\.?|RS)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const CREDIT_HINT = /\b(credited|received|deposited|refund|salary|cash ?in|incoming)\b/i;

/** Prefill for the manual form. */
export function guessFromText(text: string): { amount: number | null; direction: Direction } {
  const m = AMOUNT.exec(text);
  return {
    amount: m ? Number(m[1].replace(/,/g, '')) : null,
    direction: CREDIT_HINT.test(text) ? 'credit' : 'debit',
  };
}

export interface ManualFix {
  amount: number;
  direction: Direction;
  merchant: string;
  category: Category;
}

export function validateFix(f: { amount: number | null; merchant: string }): string | null {
  if (f.amount == null || !Number.isFinite(f.amount) || f.amount <= 0) return 'Enter the amount';
  if (f.amount > 100_000_000) return 'That amount looks too large';
  return null;
}

/** The user's own reading of an alert becomes a normal transaction (full confidence). */
export function transactionFromFix(alert: UnparsedAlert, fix: ManualFix): CategorizedTransaction {
  const base = categorize({
    amount: fix.amount,
    currency: 'PKR',
    direction: fix.direction,
    merchant: fix.merchant.trim() || null,
    balance: null,
    accountHint: null,
    isTransfer: fix.category === 'Transfers',
    occurredAt: new Date(alert.receivedAt),
    sender: alert.from,
    source: alert.source,
    parsedBy: 'user-fix',
    confidence: 1,
  });
  return { ...base, category: fix.category, categorizedBy: 'user-rule' };
}

export interface SampleMail {
  to: string;
  sender: string;
  source: UnparsedAlert['source'];
  /** Already redacted AND reviewed/edited by the user */
  text: string;
  appVersion: string;
}

/** A draft in the user's own email app. The user sees it and presses Send themselves. */
export function buildSampleMailUrl(s: SampleMail): string {
  const subject = `Unsupported alert: ${s.sender}`;
  const body = [
    `Sender: ${s.sender}`,
    `Channel: ${s.source === 'email' ? 'email' : 'SMS / app notification'}`,
    `App version: ${s.appVersion}`,
    '----- alert (anonymised, reviewed by me) -----',
    s.text,
  ].join('\n');
  return `mailto:${encodeURIComponent(s.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
