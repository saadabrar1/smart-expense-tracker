package pk.smartexpense.notificationcapture

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NotificationCapture")

    Events(EVENT_CAPTURED)

    OnStartObserving(EVENT_CAPTURED) { observer = this@NotificationCaptureModule }
    OnStopObserving(EVENT_CAPTURED) {
      if (observer === this@NotificationCaptureModule) observer = null
    }
    OnDestroy {
      if (observer === this@NotificationCaptureModule) observer = null
    }

    /** True once the user has enabled our listener in Settings → Notification access. */
    Function("isPermissionGranted") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      val me = ComponentName(context, AlertNotificationListener::class.java)
      enabled.split(":").any { ComponentName.unflattenFromString(it) == me }
    }

    /** Opens the system "Notification access" screen (the user must toggle us on there). */
    Function("openPermissionSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("getPending") {
      CaptureQueue.peek(context).map { it.toMap() }
    }

    Function("ack") { ids: List<String> ->
      CaptureQueue.ack(context, ids)
    }

    Function("setBlockedPackages") { packages: List<String> ->
      CaptureQueue.setBlockedPackages(context, packages)
    }

    Function("clear") {
      CaptureQueue.clear(context)
    }
  }

  companion object {
    private const val EVENT_CAPTURED = "onCaptured"

    @Volatile
    private var observer: NotificationCaptureModule? = null

    /** Called from the listener service; only delivers while JS is subscribed. The queue holds it otherwise. */
    fun emitCaptured(item: CapturedNotification) {
      observer?.sendEvent(EVENT_CAPTURED, item.toMap())
    }
  }
}
