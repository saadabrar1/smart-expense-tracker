import { dedupeKey, type CategorizedTransaction } from '@smart-expense/engine';

/** Pure helpers for persisting transactions (Dates ↔ JSON) and merging new ones without duplicates. */

export type StoredTransaction = Omit<CategorizedTransaction, 'occurredAt'> & { occurredAt: string; key: string };

export function toStored(t: CategorizedTransaction): StoredTransaction {
  return { ...t, occurredAt: t.occurredAt.toISOString(), key: `${dedupeKey(t)}|${t.occurredAt.getTime()}` };
}

export function fromStored(s: StoredTransaction): CategorizedTransaction {
  const { key: _key, ...rest } = s;
  return { ...rest, occurredAt: new Date(s.occurredAt) };
}

const SAME_WINDOW_MS = 10 * 60_000;

type Comparable = Pick<CategorizedTransaction, 'amount' | 'direction' | 'accountHint'> & { occurredAt: Date | string };
const time = (t: Comparable) => (typeof t.occurredAt === 'string' ? Date.parse(t.occurredAt) : t.occurredAt.getTime());

/**
 * Same real-world transaction seen through two channels (bank SMS, wallet app, Gmail API,
 * Gmail notification preview)? Same direction and amount within 10 minutes, and account
 * numbers don't conflict — a missing account on one side (e.g. a short Gmail preview) still matches.
 * Trade-off: two identical payments on the same account within 10 minutes collapse into one.
 */
export function isSameTransaction(a: Comparable, b: Comparable): boolean {
  if (a.direction !== b.direction || Math.abs(a.amount - b.amount) > 0.005) return false;
  if (Math.abs(time(a) - time(b)) > SAME_WINDOW_MS) return false;
  return !a.accountHint || !b.accountHint || a.accountHint === b.accountHint;
}

/** Prefer the richer copy: higher confidence, then more fields filled in. */
function score(t: Pick<CategorizedTransaction, 'confidence' | 'merchant' | 'accountHint' | 'balance'>): number {
  return t.confidence + (t.merchant ? 0.01 : 0) + (t.accountHint ? 0.01 : 0) + (t.balance != null ? 0.01 : 0);
}

/** Merge incoming into existing without duplicates. Newest first. */
export function mergeTransactions(existing: StoredTransaction[], incoming: CategorizedTransaction[]): StoredTransaction[] {
  const out = [...existing];
  for (const t of incoming) {
    const i = out.findIndex(s => isSameTransaction(s, t));
    if (i === -1) out.push(toStored(t));
    else if (score(t) > score(out[i])) out[i] = toStored(t);
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
