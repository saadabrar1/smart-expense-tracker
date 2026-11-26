import type { ParsedTransaction } from './types.ts';

export const SAME_WINDOW_MS = 10 * 60_000;

export type Comparable = Pick<ParsedTransaction, 'amount' | 'direction' | 'accountHint'> & { occurredAt: Date | string };

const time = (t: Comparable) => (typeof t.occurredAt === 'string' ? Date.parse(t.occurredAt) : t.occurredAt.getTime());

/**
 * Same real-world transaction seen through two channels (bank SMS, wallet app, Gmail,
 * forwarded email, Gmail notification preview)? Same direction and amount within 10 minutes,
 * and account numbers don't conflict — a missing account on one side still matches.
 * Trade-off: two identical payments on the same account within 10 minutes collapse into one.
 * Used on the phone and on the server so both dedupe identically.
 */
export function isSameTransaction(a: Comparable, b: Comparable): boolean {
  if (a.direction !== b.direction || Math.abs(Number(a.amount) - Number(b.amount)) > 0.005) return false;
  if (Math.abs(time(a) - time(b)) > SAME_WINDOW_MS) return false;
  return !a.accountHint || !b.accountHint || a.accountHint === b.accountHint;
}

/** Prefer the richer copy: higher confidence, then more fields filled in. */
export function richness(t: Pick<ParsedTransaction, 'confidence' | 'merchant' | 'accountHint' | 'balance'>): number {
  return t.confidence + (t.merchant ? 0.01 : 0) + (t.accountHint ? 0.01 : 0) + (t.balance != null ? 0.01 : 0);
}
