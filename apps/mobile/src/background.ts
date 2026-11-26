import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { restoreGmail } from './gmail/auth.ts';
import { runGmailSync } from './syncRunner.ts';
import { drainNotifications } from './notifications/runner.ts';

export const GMAIL_SYNC_TASK = 'gmail-sync';

// Must be defined at module scope (imported from the app entry), not inside a component.
// One task handles both sources; a failure in one doesn't block the other.
TaskManager.defineTask(GMAIL_SYNC_TASK, async () => {
  const results = await Promise.allSettled([
    drainNotifications(),
    (async () => {
      if (await restoreGmail()) await runGmailSync(1); // one pass per wake-up keeps work short
    })(),
  ]);
  return results.every(r => r.status === 'fulfilled')
    ? BackgroundTask.BackgroundTaskResult.Success
    : BackgroundTask.BackgroundTaskResult.Failed;
});

/** The OS treats the interval as a minimum (15 min floor); real runs are batched for battery. */
export async function enableBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(GMAIL_SYNC_TASK))) {
    await BackgroundTask.registerTaskAsync(GMAIL_SYNC_TASK, { minimumInterval: 15 });
  }
}

export async function disableBackgroundSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(GMAIL_SYNC_TASK)) {
    await BackgroundTask.unregisterTaskAsync(GMAIL_SYNC_TASK);
  }
}
