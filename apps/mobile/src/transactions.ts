import { dedupeKey, type CategorizedTransaction } from '@smart-expense/engine';

/** Pure helpers for persisting transactions (Dates ↔ JSON) and merging new ones without duplicates. */

export type StoredTransaction = Omit<CategorizedTransaction, 'occurredAt'> & { occurredAt: string; key: string };

export function toStored(t: CategorizedTransaction): StoredTransaction {
  return { ...t, occurredAt: t.occurredAt.toISOString(), key: dedupeKey(t) };
}

export function fromStored(s: StoredTransaction): CategorizedTransaction {
  const { key: _key, ...rest } = s;
  return { ...rest, occurredAt: new Date(s.occurredAt) };
}

/**
 * Merge incoming into existing. Same key (amount+direction+account within a 10-min bucket)
 * = same real transaction seen through another channel (notification vs email); keep the
 * higher-confidence copy. Newest first.
 */
export function mergeTransactions(existing: StoredTransaction[], incoming: CategorizedTransaction[]): StoredTransaction[] {
  const byKey = new Map(existing.map(t => [t.key, t]));
  for (const t of incoming) {
    const s = toStored(t);
    const prev = byKey.get(s.key);
    if (!prev || s.confidence > prev.confidence) byKey.set(s.key, s);
  }
  return [...byKey.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
