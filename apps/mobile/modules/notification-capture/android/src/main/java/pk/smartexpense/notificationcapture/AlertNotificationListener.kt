package pk.smartexpense.notificationcapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every posted notification once the user grants Notification access, keeps only
 * the ones that look like money alerts (amount present, not a personal chat), and queues
 * them on the device. JS drains the queue, parses, then acks (deletes) the entries.
 *
 * Nothing here leaves the phone.
 */
class AlertNotificationListener : NotificationListenerService() {

  override fun onListenerConnected() {
    // Pick up alerts already sitting in the notification shade when access is first granted.
    try {
      activeNotifications?.forEach { handle(it) }
    } catch (_: SecurityException) {
      // Listener not fully bound yet; new notifications will still arrive.
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    handle(sbn)
  }

  private fun handle(sbn: StatusBarNotification) {
    val captured = extract(sbn) ?: return
    if (CaptureQueue.add(applicationContext, captured)) {
      NotificationCaptureModule.emitCaptured(captured)
    }
  }

  private fun extract(sbn: StatusBarNotification): CapturedNotification? {
    if (sbn.packageName == packageName) return null
    if (sbn.packageName in CaptureQueue.blockedPackages(applicationContext)) return null
    val n = sbn.notification ?: return null
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return null

    val extras = n.extras ?: return null
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
    val candidates = listOfNotNull(
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
      extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
      extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n"),
    )
    // Big text holds the full SMS; plain text is often truncated. Take the longest.
    val text = candidates.maxByOrNull { it.length }?.trim().orEmpty()
    if (text.isEmpty()) return null

    // Only money alerts: must mention an amount. Personal SMS from a phone number are skipped.
    if (!AMOUNT.containsMatchIn("$title $text")) return null
    if (title != null && PHONE_NUMBER.matches(title)) return null

    return CapturedNotification(
      packageName = sbn.packageName,
      title = title,
      text = text,
      postedAt = sbn.postTime,
      key = sbn.key,
      whenMs = if (n.`when` > 0) n.`when` else sbn.postTime,
    )
  }

  companion object {
    private val AMOUNT = Regex("""(?i)\b(PKR|Rs\.?|RS)\s?[0-9]""")
    /** "+92 300 1234567", "03001234567". Bank short codes (e.g. 4–6 digits) are kept. */
    private val PHONE_NUMBER = Regex("""^\+?[0-9][0-9\s-]{9,}$""")
  }
}
