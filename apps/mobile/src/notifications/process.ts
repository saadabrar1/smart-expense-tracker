import { parseMessage, categorize, dedupeKey, type CategorizedTransaction, type Template, type UserRules } from '@smart-expense/engine';

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

const PHONE_NUMBER = /^\+?[0-9][0-9\s-]{9,}$/;
/** Android 15+ hides OTP-looking notifications from listeners and shows this placeholder instead. */
const REDACTED = /sensitive notification content hidden/i;

export type CaptureOutcome =
  | { kind: 'transaction'; id: string; tx: CategorizedTransaction }
  | { kind: 'skipped'; id: string; reason: 'personal-sms' | 'redacted' | 'otp' | 'promo' | 'not-financial' }
  | { kind: 'unparsed'; id: string; packageName: string; title: string | null };

export function toRawMessage(n: CapturedNotification) {
  const isSms = SMS_APPS.has(n.packageName);
  return {
    // For SMS the sender id is what identifies the bank; for apps it's the package.
    sender: isSms ? (n.title ?? n.packageName) : n.packageName,
    // App notifications often put the amount in the title ("Rs. 500 sent"), so include it.
    body: isSms || !n.title ? n.text : `${n.title}. ${n.text}`,
    receivedAt: new Date(n.whenMs || n.postedAt),
    source: 'notification' as const,
  };
}

export function processCaptured(
  n: CapturedNotification,
  opts: { templates?: Template[]; userRules?: UserRules } = {},
): CaptureOutcome {
  if (REDACTED.test(n.text)) return { kind: 'skipped', id: n.id, reason: 'redacted' };
  if (SMS_APPS.has(n.packageName) && n.title && PHONE_NUMBER.test(n.title.trim())) {
    return { kind: 'skipped', id: n.id, reason: 'personal-sms' };
  }
  const r = parseMessage(toRawMessage(n), opts.templates ?? []);
  if (r.kind === 'transaction') return { kind: 'transaction', id: n.id, tx: categorize(r.tx, opts.userRules) };
  if (r.reason === 'failed') return { kind: 'unparsed', id: n.id, packageName: n.packageName, title: n.title };
  return { kind: 'skipped', id: n.id, reason: r.reason };
}

/** Process a batch; returns transactions (deduped within the batch) and the ids to ack. */
export function processBatch(items: CapturedNotification[], opts: { templates?: Template[]; userRules?: UserRules } = {}) {
  const transactions: CategorizedTransaction[] = [];
  const unparsed: Extract<CaptureOutcome, { kind: 'unparsed' }>[] = [];
  const keys = new Set<string>();
  for (const n of items) {
    const o = processCaptured(n, opts);
    if (o.kind === 'transaction') {
      const k = dedupeKey(o.tx);
      if (!keys.has(k)) {
        keys.add(k);
        transactions.push(o.tx);
      }
    } else if (o.kind === 'unparsed') {
      unparsed.push(o);
    }
  }
  return { transactions, unparsed, ackIds: items.map(i => i.id) };
}
