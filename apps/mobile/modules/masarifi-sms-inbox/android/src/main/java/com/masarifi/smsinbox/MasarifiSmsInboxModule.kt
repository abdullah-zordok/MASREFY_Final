package com.masarifi.smsinbox

import android.Manifest
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.provider.Telephony
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MasarifiSmsInboxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MasarifiSmsInbox")

    AsyncFunction("readSmsPage") { since: Double, afterId: String, requestedLimit: Int ->
      val context=appContext.reactContext ?: throw IllegalStateException("sms_context_unavailable")
      if(context.checkSelfPermission(Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED) throw SecurityException("sms_permission_required")
      val messages=mutableListOf<Map<String,Any>>()
      val id=afterId.toLongOrNull() ?: -1L
      context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI,arrayOf("_id","address","body","date"),
        "date > ? OR (date = ? AND _id > ?)",arrayOf(since.toLong().toString(),since.toLong().toString(),id.toString()),"date ASC, _id ASC")?.use { cursor ->
        while(messages.size<requestedLimit.coerceIn(1,100) && cursor.moveToNext()) messages.add(mapOf("id" to cursor.getString(0),"sender" to (cursor.getString(1)?:""),"body" to (cursor.getString(2)?:""),"receivedAt" to cursor.getLong(3),"observedAt" to System.currentTimeMillis()))
      }
      messages
    }
    AsyncFunction("configureTrackingOwner") { owner:String,generation:String,sms:Boolean,notifications:Boolean,packages:List<String>,blocked:List<String>,policy:String? ->
      val context=appContext.reactContext ?: throw IllegalStateException("tracking_context_unavailable")
      TrackingOwner.configure(context,owner,generation,sms,notifications,
        packages.filter {it.matches(Regex("[a-zA-Z][\\w]*(\\.[\\w]+)+"))},
        blocked.filter {it.matches(Regex("[a-zA-Z][\\w]*(\\.[\\w]+)+"))},policy)
    }
    AsyncFunction("suspendTrackingOwner") {appContext.reactContext?.let {TrackingOwner.suspend(it)}}
    AsyncFunction("restoreTrackingOwner") { owner:String,generation:String? ->
      val context=appContext.reactContext ?: throw IllegalStateException("tracking_context_unavailable")
      TrackingOwner.restore(context,owner,generation)
    }
    AsyncFunction("clearTrackingOwner") {appContext.reactContext?.let {TrackingOwner.clear(it)}}
    AsyncFunction("finishTrackingWork") {workId:String,succeeded:Boolean -> TrackingWorker.finish(workId,succeeded)}
    AsyncFunction("presentCaptureConfirmation") {ownerId:String,notificationId:String,title:String,body:String ->
      val context=appContext.reactContext ?: throw IllegalStateException("tracking_context_unavailable")
      CaptureConfirmation.present(context,ownerId,notificationId,title,body)
    }

    AsyncFunction("readRecentSms") { since: Double, requestedLimit: Int ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("sms_context_unavailable")
      if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("sms_permission_required")
      }
      val limit = requestedLimit.coerceIn(1, 100)
      val messages = mutableListOf<Map<String, Any>>()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(
          Telephony.Sms.Inbox._ID,
          Telephony.Sms.Inbox.ADDRESS,
          Telephony.Sms.Inbox.BODY,
          Telephony.Sms.Inbox.DATE
        ),
        "${Telephony.Sms.Inbox.DATE} >= ?",
        arrayOf(since.toLong().toString()),
        "${Telephony.Sms.Inbox.DATE} ASC"
      )?.use { cursor ->
        val id = cursor.getColumnIndexOrThrow(Telephony.Sms.Inbox._ID)
        val sender = cursor.getColumnIndexOrThrow(Telephony.Sms.Inbox.ADDRESS)
        val body = cursor.getColumnIndexOrThrow(Telephony.Sms.Inbox.BODY)
        val receivedAt = cursor.getColumnIndexOrThrow(Telephony.Sms.Inbox.DATE)
        while (messages.size < limit && cursor.moveToNext()) {
          messages.add(
            mapOf(
              "id" to cursor.getString(id),
              "sender" to (cursor.getString(sender) ?: ""),
              "body" to (cursor.getString(body) ?: ""),
              "receivedAt" to cursor.getLong(receivedAt),
              "observedAt" to System.currentTimeMillis()
            )
          )
        }
      }
      messages
    }

    AsyncFunction("isNetworkAvailable") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val connectivity =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = connectivity.activeNetwork ?: return@AsyncFunction false
      val capabilities = connectivity.getNetworkCapabilities(network)
        ?: return@AsyncFunction false
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    AsyncFunction("isNotificationAccessEnabled") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ).orEmpty()
      enabled.split(':').any { value ->
        val component = ComponentName.unflattenFromString(value)
        component?.packageName == context.packageName &&
          component.className == MasarifiNotificationListenerService::class.java.name
      }
    }

    AsyncFunction("openNotificationAccessSettings") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("notification_context_unavailable")
      context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    AsyncFunction("setNotificationCaptureEnabled") { enabled: Boolean ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("notification_context_unavailable")
      NotificationCaptureState.setEnabled(context, enabled)
      if (!enabled) NotificationQueue(context).clear()
    }

    AsyncFunction("readRecentNotifications") { requestedLimit: Int ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("notification_context_unavailable")
      NotificationQueue(context).read(requestedLimit).map { record ->
        mapOf(
          "key" to record.key,
          "packageName" to record.packageName,
          "title" to record.title,
          "text" to record.text,
          "postedAt" to record.postedAt,
          "observedAt" to record.observedAt,
          "discovered" to record.discovered,
          "nativeKey" to record.nativeKey
        )
      }
    }

    AsyncFunction("acknowledgeNotifications") { keys: List<String> ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("notification_context_unavailable")
      NotificationQueue(context).acknowledge(keys.filter { it.isNotBlank() }.toSet())
    }
  }
}
