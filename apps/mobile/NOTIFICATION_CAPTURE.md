# Notification capture (bank SMS and wallet alerts)

Android only. A local Expo module, `modules/notification-capture`, registers a `NotificationListenerService`. Once the user turns on **Settings → Notification access → Smart Expense**, it receives every posted notification and keeps only money alerts.

## What it captures
- **Bank SMS**, read from the SMS app's notification (Google Messages, Samsung Messages, AOSP/OEM `com.android.mms`). The notification title is the SMS sender id (e.g. "HBL", "8287").
- **Banking and wallet app alerts** (JazzCash, Easypaisa, bank apps…), whatever app posts them.
- Alerts already in the notification shade when access is first granted.
- Works while the app is closed: the service queues alerts on the device, and the app drains the queue on open, live while open, and in the 15-min background task.

## Filters (privacy)
| Where | Rule |
|---|---|
| Native (`AlertNotificationListener.kt`) | must contain an amount (`Rs`/`PKR` + digit); skip chat apps (WhatsApp, Telegram, Messenger, …; list in `CaptureQueue.kt`, overridable via `setBlockedPackages`); skip SMS whose sender is a phone number; skip group summaries; skip our own notifications |
| JS (`src/notifications/process.ts`) | skip OTPs, promos, Android-15 redacted ("Sensitive notification content hidden"); parse → categorise; dedupe with Gmail |

Raw text lives only in the app's private on-device queue until it's parsed, then it's deleted (acked). Nothing is uploaded.

## Limits
- **No SMS history.** Only alerts that arrive after access is granted (plus whatever is in the shade). Reading the SMS inbox needs `READ_SMS`, which Google Play allows only for default SMS apps. The Gmail 90-day import fills the gap.
- If the user muted notifications for that SMS thread or app, there is nothing to capture.
- Android 15+ hides OTP-like notifications from listeners. Normal transaction alerts aren't affected.

## Testing on a phone
1. Build a development build (see GMAIL_SETUP.md §2). Expo Go doesn't include this native module.
2. **Android 13+ with a sideloaded APK** (EAS/dev build, not from Play): Android blocks notification access for sideloaded apps at first. Open **App info → ⋮ → Allow restricted settings**, then enable Notification access.
3. A test SMS from a friend's phone is **ignored** on purpose (phone-number sender). Test with a real bank alert or a wallet app notification, e.g. a small Raast or JazzCash transfer.
4. The Kotlin code has **not been compiled yet** (no Android SDK on the machine it was written on). The first `eas build` is its first compile; fix any build errors there.

## Google Play
In the Play Console, declare notification access in the privacy and data-safety section ("reads financial notifications to record transactions, processed on device"). Keep the in-app explanation screen shown before sending users to Settings. Play reviews notification-listener apps for a clear core purpose.
