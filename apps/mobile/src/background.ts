import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { restoreGmail } from './gmail/auth.ts';
import { runGmailSync } from './syncRunner.ts';

export const GMAIL_SYNC_TASK = 'gmail-sync';

// Must be defined at module scope (imported from the app entry), not inside a component.
TaskManager.defineTask(GMAIL_SYNC_TASK, async () => {
  try {
    if (!(await restoreGmail())) return BackgroundTask.BackgroundTaskResult.Success;
    await runGmailSync(1); // one pass per wake-up keeps background work short
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
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
