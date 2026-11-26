import { NotificationCapture } from '../../modules/notification-capture';
import { processBatch } from './process';
import { mergeTransactions } from '../transactions';
import { store } from '../store';
import { isGmailConnected, restoreGmail } from '../gmail/auth';
import { runGmailSync } from '../syncRunner';

type DrainResult = { added: number; unparsed: number; gmailSynced: boolean };
let running: Promise<DrainResult> | null = null;

/**
 * Drain the native queue → parse → merge into local transactions → ack.
 *
 * Gmail-app notifications: if Gmail is connected they trigger an immediate Gmail API sync
 * (full email, better parse) instead of parsing the short preview. If that sync fails
 * (token expired, offline, access revoked) we fall back to parsing the preview.
 *
 * Ack happens only after saving, so a crash mid-way re-processes (merge dedupes) instead of losing alerts.
 */
export function drainNotifications(): Promise<DrainResult> {
  running ??= (async () => {
    const pending = NotificationCapture.getPending();
    if (!pending.length) return { added: 0, unparsed: 0, gmailSynced: false };

    const batch = processBatch(pending, { gmailConnected: isGmailConnected() });
    const transactions = [...batch.transactions];
    const unparsed = [...batch.unparsed];

    let gmailSynced = false;
    if (batch.gmailTriggers.length) {
      try {
        if (!(await restoreGmail())) throw new Error('Gmail not connected');
        await runGmailSync(1);
        gmailSynced = true;
      } catch {
        const fallback = processBatch(batch.gmailTriggers, { gmailConnected: false });
        transactions.push(...fallback.transactions);
        unparsed.push(...fallback.unparsed);
      }
    }

    const added = await store.updateTransactions(prev => mergeTransactions(prev, transactions));
    if (unparsed.length) {
      await store.saveUnparsed([
        ...(await store.loadUnparsed()),
        ...unparsed.map(u => ({ id: u.id, source: 'notification' as const, from: u.packageName, subject: u.title, reason: 'failed' })),
      ]);
    }
    NotificationCapture.ack(batch.ackIds);
    return { added, unparsed: unparsed.length, gmailSynced };
  })().finally(() => {
    running = null;
  });
  return running;
}
