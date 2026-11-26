package pk.smartexpense.notificationcapture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class CapturedNotification(
  val packageName: String,
  val title: String?,
  val text: String,
  val postedAt: Long,
  /** StatusBarNotification.key (one per notification / SMS conversation) */
  val key: String,
  /** Notification.when — the message's own timestamp; unchanged when the same alert is re-posted */
  val whenMs: Long,
) {
  /**
   * Stable id: a re-post/update of the same alert maps to the same id, while a new but
   * identical-looking alert (same text, later time) gets a new one.
   */
  val id: String = "${key.hashCode()}|$whenMs|${text.hashCode()}"

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("key", key)
    .put("whenMs", whenMs)
    .put("packageName", packageName)
    .put("title", title ?: JSONObject.NULL)
    .put("text", text)
    .put("postedAt", postedAt)

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "title" to title,
    "text" to text,
    "postedAt" to postedAt.toDouble(),
    "key" to key,
    "whenMs" to whenMs.toDouble(),
  )

  companion object {
    fun fromJson(o: JSONObject) = CapturedNotification(
      packageName = o.getString("packageName"),
      title = if (o.isNull("title")) null else o.getString("title"),
      text = o.getString("text"),
      postedAt = o.getLong("postedAt"),
      key = o.getString("key"),
      whenMs = o.getLong("whenMs"),
    )
  }
}

/**
 * Small persistent on-device queue (SharedPreferences, private to the app).
 * The listener service can run while the JS runtime is not loaded, so captured alerts
 * wait here until the app or the background task drains them.
 */
object CaptureQueue {
  private const val PREFS = "smart_expense_notification_capture"
  private const val KEY_QUEUE = "queue"
  private const val KEY_RECENT = "recent_ids"
  private const val KEY_BLOCKED = "blocked_packages"
  private const val MAX_QUEUE = 300
  private const val MAX_RECENT = 500

  /** Chat/social apps: never captured, even if a message mentions an amount. */
  private val DEFAULT_BLOCKED = setOf(
    "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.facebook.orca",
    "com.facebook.katana", "com.instagram.android", "com.snapchat.android", "com.discord",
    "com.imo.android.imoim", "com.viber.voip", "com.skype.raider", "com.google.android.apps.dynamite",
  )

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun blockedPackages(ctx: Context): Set<String> =
    prefs(ctx).getStringSet(KEY_BLOCKED, null) ?: DEFAULT_BLOCKED

  @Synchronized
  fun setBlockedPackages(ctx: Context, packages: List<String>) {
    prefs(ctx).edit().putStringSet(KEY_BLOCKED, packages.toSet()).apply()
  }

  /** Returns false if this alert was already captured (re-posts / updates of the same notification). */
  @Synchronized
  fun add(ctx: Context, item: CapturedNotification): Boolean {
    val p = prefs(ctx)
    val recent = JSONArray(p.getString(KEY_RECENT, "[]"))
    for (i in 0 until recent.length()) if (recent.getString(i) == item.id) return false

    val queue = JSONArray(p.getString(KEY_QUEUE, "[]"))
    queue.put(item.toJson())
    recent.put(item.id)
    p.edit()
      .putString(KEY_QUEUE, tail(queue, MAX_QUEUE).toString())
      .putString(KEY_RECENT, tail(recent, MAX_RECENT).toString())
      .apply()
    return true
  }

  @Synchronized
  fun peek(ctx: Context): List<CapturedNotification> {
    val queue = JSONArray(prefs(ctx).getString(KEY_QUEUE, "[]"))
    return (0 until queue.length()).map { CapturedNotification.fromJson(queue.getJSONObject(it)) }
  }

  /** Remove processed entries. Ids stay in the "recent" list so re-posts aren't captured again. */
  @Synchronized
  fun ack(ctx: Context, ids: Collection<String>) {
    val drop = ids.toSet()
    val queue = JSONArray(prefs(ctx).getString(KEY_QUEUE, "[]"))
    val kept = JSONArray()
    for (i in 0 until queue.length()) {
      val o = queue.getJSONObject(i)
      if (o.getString("id") !in drop) kept.put(o)
    }
    prefs(ctx).edit().putString(KEY_QUEUE, kept.toString()).apply()
  }

  @Synchronized
  fun clear(ctx: Context) {
    prefs(ctx).edit().remove(KEY_QUEUE).remove(KEY_RECENT).apply()
  }

  private fun tail(a: JSONArray, max: Int): JSONArray {
    if (a.length() <= max) return a
    val out = JSONArray()
    for (i in a.length() - max until a.length()) out.put(a.get(i))
    return out
  }
}
