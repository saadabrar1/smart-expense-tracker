import { NotificationCapture } from '../../modules/notification-capture';
import { processBatch } from './process';
import { mergeTransactions } from '../transactions';
import { store } from '../store';

let running: Promise<{ added: number; unparsed: number }> | null = null;

/**
 * Drain the native queue → parse → merge into local transactions → ack.
 * Ack happens only after the merged list is saved, so a crash mid-way re-processes
 * (merge dedupes) instead of losing alerts.
 */
export function drainNotifications(): Promise<{ added: number; unparsed: number }> {
  running ??= (async () => {
    const pending = NotificationCapture.getPending();
    if (!pending.length) return { added: 0, unparsed: 0 };

    const { transactions, unparsed, ackIds } = processBatch(pending);
    const before = await store.loadTransactions();
    const merged = mergeTransactions(before, transactions);
    await store.saveTransactions(merged);
    if (unparsed.length) {
      await store.saveUnparsed([
        ...(await store.loadUnparsed()),
        ...unparsed.map(u => ({ id: u.id, source: 'notification' as const, from: u.packageName, subject: u.title, reason: 'failed' })),
      ]);
    }
    NotificationCapture.ack(ackIds);
    return { added: merged.length - before.length, unparsed: unparsed.length };
  })().finally(() => {
    running = null;
  });
  return running;
}
