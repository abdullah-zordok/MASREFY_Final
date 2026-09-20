package com.masarifi.smsinbox

import android.app.Notification
import android.content.Context
import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

data class CapturedNotification(
  val key: String,
  val packageName: String,
  val title: String,
  val text: String,
  val postedAt: Long
)

object NotificationQueuePolicy {
  const val MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000
  private const val MAX_RECORDS = 200

  fun prune(records: List<CapturedNotification>, now: Long): List<CapturedNotification> =
    records
      .filter { it.postedAt in (now - MAX_AGE_MS)..now }
      .distinctBy { it.key }
      .sortedByDescending { it.postedAt }
      .take(MAX_RECORDS)

  fun acknowledge(
    records: List<CapturedNotification>,
    keys: Set<String>
  ): List<CapturedNotification> = records.filterNot { it.key in keys }
}

internal class NotificationQueue(context: Context) {
  private val preferences: SharedPreferences = context.getSharedPreferences(
    "masarifi_notification_queue_v1",
    Context.MODE_PRIVATE
  )

  fun add(record: CapturedNotification) = synchronized(lock) {
    write(NotificationQueuePolicy.prune(readStored() + record, System.currentTimeMillis()))
  }

  fun read(limit: Int): List<CapturedNotification> = synchronized(lock) {
    val records = NotificationQueuePolicy.prune(readStored(), System.currentTimeMillis())
    write(records)
    records.take(limit.coerceIn(1, 100))
  }

  fun acknowledge(keys: Set<String>) = synchronized(lock) {
    write(NotificationQueuePolicy.acknowledge(readStored(), keys))
  }

  private fun readStored(): List<CapturedNotification> {
    val array = runCatching {
      JSONArray(preferences.getString("records", "[]"))
    }.getOrElse { JSONArray() }
    return buildList {
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        val key = item.optString("key")
        val packageName = item.optString("packageName")
        val postedAt = item.optLong("postedAt", -1)
        if (key.isBlank() || packageName.isBlank() || postedAt < 0) continue
        add(
          CapturedNotification(
            key,
            packageName,
            item.optString("title"),
            item.optString("text"),
            postedAt
          )
        )
      }
    }
  }

  private fun write(records: List<CapturedNotification>) {
    val array = JSONArray()
    records.forEach { record ->
      array.put(
        JSONObject()
          .put("key", record.key)
          .put("packageName", record.packageName)
          .put("title", record.title)
          .put("text", record.text)
          .put("postedAt", record.postedAt)
      )
    }
    preferences.edit().putString("records", array.toString()).apply()
  }

  private companion object {
    val lock = Any()
  }
}

class MasarifiNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(notification: StatusBarNotification) {
    if (notification.packageName == packageName) return
    val extras = notification.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT)
      )?.toString().orEmpty()
    if (title.isBlank() && text.isBlank()) return
    NotificationQueue(this).add(
      CapturedNotification(
        notification.key,
        notification.packageName,
        title,
        text,
        notification.postTime
      )
    )
  }
}
