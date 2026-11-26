import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_STATE, type SyncState, type UnparsedAlert } from './gmail/sync.ts';
import type { StoredTransaction } from './transactions.ts';

/**
 * On-device persistence. Holds parsed transactions and sync bookkeeping only —
 * never raw email bodies.
 */

const K = {
  tx: 'set:transactions:v1',
  sync: 'set:gmail-sync:v1',
  unparsed: 'set:gmail-unparsed:v1',
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const store = {
  loadTransactions: () => readJson<StoredTransaction[]>(K.tx, []),
  saveTransactions: (t: StoredTransaction[]) => AsyncStorage.setItem(K.tx, JSON.stringify(t)),
  loadSyncState: () => readJson<SyncState>(K.sync, EMPTY_STATE),
  saveSyncState: (s: SyncState) => AsyncStorage.setItem(K.sync, JSON.stringify(s)),
  loadUnparsed: () => readJson<UnparsedAlert[]>(K.unparsed, []),
  saveUnparsed: (u: UnparsedAlert[]) => AsyncStorage.setItem(K.unparsed, JSON.stringify(u.slice(-200))),
  /** Used on disconnect: forget Gmail bookkeeping; keep the user's transactions. */
  clearGmail: () => AsyncStorage.multiRemove([K.sync, K.unparsed]),
};
