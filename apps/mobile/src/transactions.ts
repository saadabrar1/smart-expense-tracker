import { dedupeKey, isSameTransaction, richness, type CategorizedTransaction } from '@smart-expense/engine';

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

/** Merge incoming into existing without duplicates (see isSameTransaction). Newest first. */
export function mergeTransactions(existing: StoredTransaction[], incoming: CategorizedTransaction[]): StoredTransaction[] {
  const out = [...existing];
  for (const t of incoming) {
    const i = out.findIndex(s => isSameTransaction(s, t));
    if (i === -1) out.push(toStored(t));
    else if (richness(t) > richness(out[i])) out[i] = toStored(t);
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
