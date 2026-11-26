import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category, UserRules } from '@smart-expense/engine';
import { EMPTY_STATE, type SyncState, type UnparsedAlert } from './gmail/sync.ts';
import type { StoredTransaction } from './transactions.ts';

/**
 * On-device persistence. Holds parsed transactions, sync bookkeeping, the user's
 * merchant→category rules, and — only for alerts we couldn't parse — their text, so the
 * user can review them. That text is deleted once the alert is resolved.
 */

const K = {
  tx: 'set:transactions:v1',
  sync: 'set:gmail-sync:v1',
  unparsed: 'set:unparsed:v2',
  rules: 'set:user-rules:v1',
};

const MAX_UNPARSED = 200;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Gmail sync, notification draining and the UI can write at the same time (e.g. the
 * background task); serialise read-modify-write per key so no update is lost.
 */
const chains = new Map<string, Promise<unknown>>();
function update<T, R>(key: string, fallback: T, fn: (prev: T) => { next: T; result: R }): Promise<R> {
  const run = (chains.get(key) ?? Promise.resolve()).then(async () => {
    const prev = await readJson<T>(key, fallback);
    const { next, result } = fn(prev);
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return result;
  });
  chains.set(key, run.catch(() => undefined));
  return run;
}

export const store = {
  loadTransactions: () => readJson<StoredTransaction[]>(K.tx, []),
  /** Returns how many transactions were added. */
  updateTransactions: (fn: (prev: StoredTransaction[]) => StoredTransaction[]) =>
    update<StoredTransaction[], number>(K.tx, [], prev => {
      const next = fn(prev);
      return { next, result: next.length - prev.length };
    }),

  loadSyncState: () => readJson<SyncState>(K.sync, EMPTY_STATE),
  saveSyncState: (s: SyncState) => AsyncStorage.setItem(K.sync, JSON.stringify(s)),

  loadUnparsed: () => readJson<UnparsedAlert[]>(K.unparsed, []),
  addUnparsed: (items: UnparsedAlert[]) =>
    update<UnparsedAlert[], void>(K.unparsed, [], prev => {
      const ids = new Set(prev.map(p => p.id));
      return { next: [...prev, ...items.filter(i => !ids.has(i.id))].slice(-MAX_UNPARSED), result: undefined };
    }),
  removeUnparsed: (id: string) =>
    update<UnparsedAlert[], void>(K.unparsed, [], prev => ({ next: prev.filter(p => p.id !== id), result: undefined })),

  /** Merchant (normalised) → category, learned from the user's corrections. */
  loadUserRules: async (): Promise<UserRules> => new Map(await readJson<[string, Category][]>(K.rules, [])),
  saveUserRules: (rules: UserRules) => AsyncStorage.setItem(K.rules, JSON.stringify([...rules.entries()])),

  /** Used on disconnect: forget Gmail bookkeeping and Gmail-sourced review items; keep transactions. */
  clearGmail: async () => {
    await AsyncStorage.removeItem(K.sync);
    await update<UnparsedAlert[], void>(K.unparsed, [], prev => ({ next: prev.filter(p => p.source !== 'email'), result: undefined }));
  },
};
