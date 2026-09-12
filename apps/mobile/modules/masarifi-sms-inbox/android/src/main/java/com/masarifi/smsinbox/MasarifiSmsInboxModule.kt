package com.masarifi.smsinbox

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MasarifiSmsInboxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MasarifiSmsInbox")

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
              "receivedAt" to cursor.getLong(receivedAt)
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
  }
}
