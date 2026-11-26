import { combineCopies, dedupeKey, isSameTransaction, markOwnTransfers, type CategorizedTransaction } from '@smart-expense/engine';

/** Pure helpers for persisting transactions (Dates ↔ JSON) and merging new ones without duplicates. */

export { isSameTransaction };

export type StoredTransaction = Omit<CategorizedTransaction, 'occurredAt'> & { occurredAt: string; key: string };

export function toStored(t: CategorizedTransaction): StoredTransaction {
  return { ...t, occurredAt: t.occurredAt.toISOString(), key: `${dedupeKey(t)}|${t.occurredAt.getTime()}` };
}

export function fromStored(s: StoredTransaction): CategorizedTransaction {
  const { key: _key, ...rest } = s;
  return { ...rest, occurredAt: new Date(s.occurredAt) };
}

/** A transfer between own accounts is categorised "Transfers" unless the user chose otherwise. */
function withTransferCategory(t: StoredTransaction): StoredTransaction {
  return t.isTransfer && t.categorizedBy !== 'user-rule' && t.category !== 'Transfers'
    ? { ...t, category: 'Transfers', categorizedBy: 'keyword' }
    : t;
}

/**
 * Merge incoming into existing without duplicates (see isSameTransaction): copies of the same
 * transaction are combined (best fields from each), then money sent to the user's own accounts
 * is marked as a transfer. Newest first.
 */
export function mergeTransactions(existing: StoredTransaction[], incoming: CategorizedTransaction[]): StoredTransaction[] {
  const out = [...existing];
  for (const t of incoming) {
    const s = toStored(t);
    const i = out.findIndex(x => isSameTransaction(x, s));
    if (i === -1) out.push(s);
    else out[i] = { ...combineCopies(out[i], s), key: out[i].key };
  }
  return markOwnTransfers(out).map(withTransferCategory).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
