import { parseMessage, categorize, BUILT_IN_TEMPLATES, type CategorizedTransaction, type Template, type UserRules } from '@smart-expense/engine';
import { isSameTransaction } from '../transactions.ts';

/**
 * Captured notification → transaction. Pure (no React Native imports) so it runs under node --test.
 * The native listener already dropped chat apps, personal phone-number SMS and anything without an amount.
 */

export interface CapturedNotification {
  id: string;
  packageName: string;
  title: string | null;
  text: string;
  postedAt: number;
  key: string;
  whenMs: number;
}

/** SMS apps: the notification title is the SMS sender id ("HBL", "8287"); the text is the SMS. */
export const SMS_APPS = new Set([
  'com.google.android.apps.messaging', // Google Messages
  'com.samsung.android.messaging',     // Samsung Messages
  'com.android.mms',                   // AOSP / many OEMs (Xiaomi, Infinix, Tecno…)
  'com.android.messaging',
]);

/**
 * Gmail app. Its notification holds sender name (title), subject and a short preview —
 * not the full email. With Gmail connected we use it only as a "sync now" trigger and
 * parse the full email via the API; without Gmail (or if that sync fails) we parse the preview.
 */
export const GMAIL_APP = 'com.google.android.gm';

const PHONE_NUMBER = /^\+?[0-9][0-9\s-]{9,}$/;
/** Android 15+ hides OTP-looking notifications from listeners and shows this placeholder instead. */
const REDACTED = /sensitive notification content hidden/i;

export interface ProcessOptions {
  templates?: Template[];
  userRules?: UserRules;
  /** Gmail API connected → Gmail-app notifications trigger a sync instead of being parsed */
  gmailConnected?: boolean;
}

export type CaptureOutcome =
  | { kind: 'transaction'; id: string; tx: CategorizedTransaction }
  | { kind: 'gmail-trigger'; id: string }
  | { kind: 'skipped'; id: string; reason: 'personal-sms' | 'redacted' | 'otp' | 'promo' | 'not-financial' }
  | { kind: 'unparsed'; id: string; packageName: string; sender: string; title: string | null; text: string; receivedAt: number };

export function toRawMessage(n: CapturedNotification) {
  const isSms = SMS_APPS.has(n.packageName);
  const isGmail = n.packageName === GMAIL_APP;
  return {
    // SMS: title is the sender id. Gmail: title is the sender's display name. Apps: the package.
    sender: isSms || isGmail ? (n.title ?? n.packageName) : n.packageName,
    // App notifications often put the amount in the title ("Rs. 500 sent"), so include it.
    // Gmail's text already holds subject + preview; its title is just the sender name.
    body: isSms || isGmail || !n.title ? n.text : `${n.title}. ${n.text}`,
    receivedAt: new Date(n.whenMs || n.postedAt),
    source: 'notification' as const,
  };
}

export function processCaptured(n: CapturedNotification, opts: ProcessOptions = {}): CaptureOutcome {
  if (REDACTED.test(n.text)) return { kind: 'skipped', id: n.id, reason: 'redacted' };
  if (SMS_APPS.has(n.packageName) && n.title && PHONE_NUMBER.test(n.title.trim())) {
    return { kind: 'skipped', id: n.id, reason: 'personal-sms' };
  }
  if (n.packageName === GMAIL_APP && opts.gmailConnected) return { kind: 'gmail-trigger', id: n.id };
  const raw = toRawMessage(n);
  const r = parseMessage(raw, opts.templates ? [...opts.templates, ...BUILT_IN_TEMPLATES] : undefined);
  if (r.kind === 'transaction') return { kind: 'transaction', id: n.id, tx: categorize(r.tx, opts.userRules) };
  if (r.reason === 'failed') {
    return {
      kind: 'unparsed', id: n.id, packageName: n.packageName, sender: raw.sender,
      title: n.title, text: raw.body, receivedAt: raw.receivedAt.getTime(),
    };
  }
  return { kind: 'skipped', id: n.id, reason: r.reason };
}

/** Process a batch; returns transactions (deduped within the batch), Gmail triggers and the ids to ack. */
export function processBatch(items: CapturedNotification[], opts: ProcessOptions = {}) {
  const transactions: CategorizedTransaction[] = [];
  const unparsed: Extract<CaptureOutcome, { kind: 'unparsed' }>[] = [];
  const gmailTriggers: CapturedNotification[] = [];
  for (const n of items) {
    const o = processCaptured(n, opts);
    if (o.kind === 'transaction') {
      if (!transactions.some(t => isSameTransaction(t, o.tx))) transactions.push(o.tx);
    } else if (o.kind === 'gmail-trigger') {
      gmailTriggers.push(n);
    } else if (o.kind === 'unparsed') {
      unparsed.push(o);
    }
  }
  return { transactions, unparsed, gmailTriggers, ackIds: items.map(i => i.id) };
}
