import type { ParsedTransaction } from './types.ts';

export const SAME_WINDOW_MS = 10 * 60_000;

export type Comparable = Pick<ParsedTransaction, 'amount' | 'direction' | 'accountHint'> & {
  occurredAt: Date | string;
  reference?: string | null;
};

const time = (t: Comparable) => (typeof t.occurredAt === 'string' ? Date.parse(t.occurredAt) : t.occurredAt.getTime());

/**
 * Same real-world transaction seen through two channels (bank SMS, detailed + short bank e-mail,
 * wallet app, Gmail, forwarded email, Gmail notification preview)?
 *  - Both carry a bank reference → same iff the references match (exact).
 *  - Otherwise: same direction and amount within 10 minutes, and account numbers don't conflict
 *    (a missing account on one side still matches). Trade-off: two identical payments on the
 *    same account within 10 minutes with no references collapse into one.
 * Used on the phone and on the server so both dedupe identically.
 */
export function isSameTransaction(a: Comparable, b: Comparable): boolean {
  if (a.direction !== b.direction || Math.abs(Number(a.amount) - Number(b.amount)) > 0.005) return false;
  if (a.reference && b.reference) return a.reference.toUpperCase() === b.reference.toUpperCase();
  if (Math.abs(time(a) - time(b)) > SAME_WINDOW_MS) return false;
  return !a.accountHint || !b.accountHint || a.accountHint === b.accountHint;
}

type Mergeable = Pick<ParsedTransaction, 'confidence' | 'merchant' | 'accountHint' | 'balance' | 'isTransfer'> &
  Pick<Partial<ParsedTransaction>, 'reference' | 'counterpartyHint'>;

/** Prefer the richer copy: higher confidence, then more fields filled in. */
export function richness(t: Mergeable): number {
  return t.confidence + (t.merchant ? 0.01 : 0) + (t.accountHint ? 0.01 : 0) + (t.balance != null ? 0.01 : 0)
    + (t.reference ? 0.01 : 0) + (t.counterpartyHint ? 0.01 : 0);
}

/**
 * Two copies of one transaction → one record with the best of both: the richer copy wins,
 * and any field it lacks is filled from the other (e.g. account from the detailed e-mail,
 * receiver from the short one). A transfer flag on either copy is kept.
 */
export function combineCopies<T extends Mergeable>(a: T, b: T): T {
  const [main, other] = richness(b) > richness(a) ? [b, a] : [a, b];
  return {
    ...main,
    merchant: main.merchant ?? other.merchant,
    accountHint: main.accountHint ?? other.accountHint,
    balance: main.balance ?? other.balance,
    reference: main.reference ?? other.reference ?? null,
    counterpartyHint: main.counterpartyHint ?? other.counterpartyHint ?? null,
    isTransfer: main.isTransfer || other.isTransfer,
  };
}

/**
 * Money sent to an account the user also sends FROM (seen as `accountHint` on other alerts) is a
 * transfer between their own accounts — e.g. bank → own Easypaisa wallet via RAAST — not spending.
 * Returns the same array if nothing changed.
 */
export function markOwnTransfers<T extends Pick<ParsedTransaction, 'accountHint' | 'isTransfer'> & { counterpartyHint?: string | null }>(txs: T[]): T[] {
  const own = new Set(txs.map(t => t.accountHint).filter((x): x is string => !!x));
  let changed = false;
  const out = txs.map(t => {
    if (!t.isTransfer && t.counterpartyHint && own.has(t.counterpartyHint)) {
      changed = true;
      return { ...t, isTransfer: true };
    }
    return t;
  });
  return changed ? out : txs;
}
