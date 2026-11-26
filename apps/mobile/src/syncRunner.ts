import { createGmailClient } from './gmail/api.ts';
import { getAccessToken, invalidateToken } from './gmail/auth.ts';
import { syncGmail } from './gmail/sync.ts';
import { mergeTransactions } from './transactions.ts';
import { store } from './store.ts';

export interface RunSummary {
  added: number;
  scanned: number;
  unparsed: number;
  more: boolean;
}

let running: Promise<RunSummary> | null = null;

/**
 * One sync pass, shared by the UI button and the background task.
 * Concurrent calls join the in-flight run instead of starting a second one.
 * TODO(api): upload only the parsed transactions to the backend once services/api exists.
 */
export function runGmailSync(maxPasses = 3): Promise<RunSummary> {
  running ??= (async () => {
    const gmail = createGmailClient(getAccessToken, invalidateToken);
    const summary: RunSummary = { added: 0, scanned: 0, unparsed: 0, more: false };
    let state = await store.loadSyncState();

    for (let pass = 0; pass < maxPasses; pass++) {
      const r = await syncGmail({ gmail, state });
      const added = await store.updateTransactions(prev => mergeTransactions(prev, r.transactions));
      if (r.unparsed.length) await store.saveUnparsed([...(await store.loadUnparsed()), ...r.unparsed]);
      await store.saveSyncState(r.nextState);

      summary.added += added;
      summary.scanned += r.scanned;
      summary.unparsed += r.unparsed.length;
      summary.more = r.truncated;
      state = r.nextState;
      if (!r.truncated) break;
    }
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}
