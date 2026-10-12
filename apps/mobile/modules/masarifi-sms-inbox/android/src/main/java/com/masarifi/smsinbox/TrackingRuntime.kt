package com.masarifi.smsinbox

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.work.*
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal fun trackingDigest(value: String): String = MessageDigest.getInstance("SHA-256")
  .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

internal object TrackingOwner {
  private const val PREFS = "masarifi_tracking_owner_v2"
  private const val SUSPENDED = "suspended"
  private fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun isSuspended(context: Context): Boolean = preferences(context).getBoolean(SUSPENDED,false)
  fun read(context: Context): JSONObject {
    val prefs=preferences(context)
    val state=runCatching { JSONObject(prefs.getString("context", "{}")!!) }.getOrElse { JSONObject() }
    if(prefs.getBoolean(SUSPENDED,false)) state.put("sms",false).put("notification",false)
    return state
  }
  fun active(context: Context): Boolean = read(context).let {it.optBoolean("sms") || it.optBoolean("notification")}
  @Synchronized fun restore(context: Context, owner: String, generation: String?): String {
    require(owner.matches(Regex("[a-f0-9]{64}")))
    suspend(context)
    val raw=preferences(context).getString("context",null)
    if(raw==null) {
      val legacy=context.getSharedPreferences("masarifi_notification_queue_v1",Context.MODE_PRIVATE).getString("records",null)
      val unbound=context.getSharedPreferences("masarifi_notification_queue_v2_",Context.MODE_PRIVATE).contains("ciphertext")
      val retained=context.getSharedPreferences("masarifi_notification_queue_v2_"+owner,Context.MODE_PRIVATE).contains("ciphertext")
      return if(generation==null && (legacy==null || legacy=="[]") && !unbound && !retained) "EMPTY" else "BLOCKED"
    }
    val state=runCatching {JSONObject(raw)}.getOrNull() ?: return "BLOCKED"
    val priorOwner=state.opt("owner") as? String ?: return "BLOCKED"
    val priorGeneration=state.opt("generation") as? String ?: return "BLOCKED"
    if(!priorOwner.matches(Regex("[a-f0-9]{64}")) || priorGeneration.length !in 16..80 ||
        state.opt("sms") !is Boolean || state.opt("notification") !is Boolean) return "BLOCKED"
    if(priorOwner!=owner) {
      if(context.getSharedPreferences("masarifi_notification_queue_v2_"+owner,Context.MODE_PRIVATE).contains("ciphertext")) return "BLOCKED"
      clear(context);return "CLEARED"
    }
    return if(priorGeneration==generation) "PRESERVED" else "BLOCKED"
  }
  @Synchronized fun configure(context: Context, owner: String, generation: String, sms: Boolean, notification: Boolean,
    packages: List<String>, blockedPackages: List<String>, discoveryPolicy: String?) {
    require(owner.matches(Regex("[a-f0-9]{64}")) && generation.length in 16..80)
    val old = read(context)
    if (old.optString("owner") != owner) NotificationQueue(context).clear()
    val value = JSONObject().put("owner",owner).put("generation",generation).put("sms",sms).put("notification",notification)
      .put("packages",org.json.JSONArray(packages.distinct()))
      .put("blockedPackages",org.json.JSONArray(blockedPackages.distinct()))
      .put("discoveryPolicy",if(FinancialDiscoveryPolicy.parse(discoveryPolicy) != null) discoveryPolicy else JSONObject.NULL)
    check(preferences(context).edit().putString("context",value.toString()).remove(SUSPENDED).commit())
    TrackingScheduler.configure(context)
  }
  @Synchronized fun suspend(context: Context) {
    // Preserve even malformed context bytes while making every native reader
    // observe disabled intake until an authenticated configuration replaces it.
    check(preferences(context).edit().putBoolean(SUSPENDED,true).commit())
    WorkManager.getInstance(context).cancelAllWorkByTag("masarifi-tracking")
  }
  @Synchronized fun clear(context: Context) {
    NotificationQueue(context).clear()
    check(preferences(context).edit().clear().putBoolean(SUSPENDED,true).commit())
    WorkManager.getInstance(context).cancelAllWorkByTag("masarifi-tracking")
  }
  fun allows(context: Context, packageName: String): Boolean {
    val state=read(context)
    if (!state.optBoolean("notification") || state.optString("owner").isBlank()) return false
    val blocked=state.optJSONArray("blockedPackages")
    if (blocked != null && (0 until blocked.length()).any { blocked.optString(it)==packageName }) return false
    val packages=state.optJSONArray("packages") ?: return false
    return (0 until packages.length()).any { packages.optString(it)==packageName }
  }
}

internal class TrackingEncryptedStore(private val context: Context, private val name: String) {
  private fun alias(): String = "masarifi.tracking."+TrackingOwner.read(context).optString("owner")
  private fun key(): SecretKey = synchronized(TrackingOwner) {
    val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias(),null) as? SecretKey)?.let { return@synchronized it }
    KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias(),KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  fun read(): String? {
    val encoded=context.getSharedPreferences(name+"_"+TrackingOwner.read(context).optString("owner"),Context.MODE_PRIVATE).getString("ciphertext",null) ?: return null
    val bytes=Base64.decode(encoded,Base64.NO_WRAP)
    val cipher=Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
    return String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)
  }
  fun write(value: String) {
    val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
    val encoded=Base64.encodeToString(cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)
    check(context.getSharedPreferences(name+"_"+TrackingOwner.read(context).optString("owner"),Context.MODE_PRIVATE).edit().putString("ciphertext",encoded).commit())
  }
  fun clear() {check(context.getSharedPreferences(name+"_"+TrackingOwner.read(context).optString("owner"),Context.MODE_PRIVATE).edit().clear().commit())}
}

internal object TrackingScheduler {
  private fun request(context: Context): Data {
    val owner=TrackingOwner.read(context)
    return workDataOf("ownerDigest" to owner.optString("owner"),"generation" to owner.optString("generation"))
  }
  fun configure(context: Context) {
    val owner=TrackingOwner.read(context)
    val manager=WorkManager.getInstance(context)
    if (!owner.optBoolean("sms") && !owner.optBoolean("notification")) { manager.cancelAllWorkByTag("masarifi-tracking");return }
    manager.enqueueUniquePeriodicWork("masarifi-tracking-periodic",ExistingPeriodicWorkPolicy.UPDATE,
      PeriodicWorkRequestBuilder<TrackingWorker>(15,TimeUnit.MINUTES).setInputData(request(context)).addTag("masarifi-tracking").build())
    watchSms(context)
  }
  fun watchSms(context: Context) = synchronized(TrackingOwner) {
    if (!TrackingOwner.read(context).optBoolean("sms")) return@synchronized
    val constraints=Constraints.Builder().addContentUriTrigger(Telephony.Sms.Inbox.CONTENT_URI,true)
      .setTriggerContentUpdateDelay(3,TimeUnit.SECONDS).setTriggerContentMaxDelay(15,TimeUnit.SECONDS).build()
    WorkManager.getInstance(context).enqueueUniqueWork("masarifi-tracking-sms",ExistingWorkPolicy.KEEP,
      OneTimeWorkRequestBuilder<TrackingWorker>().setInputData(request(context)).setConstraints(constraints).addTag("masarifi-tracking").build())
  }
  fun incoming(context: Context) = synchronized(TrackingOwner) {
    if(!TrackingOwner.active(context)) return@synchronized
    WorkManager.getInstance(context).enqueueUniqueWork("masarifi-tracking-incoming",ExistingWorkPolicy.KEEP,
      OneTimeWorkRequestBuilder<TrackingWorker>().setInputData(request(context)).addTag("masarifi-tracking").build())
  }
}

class TrackingWorker(context: Context, parameters: WorkerParameters): Worker(context,parameters) {
  override fun doWork(): Result {
    if(!TrackingOwner.active(applicationContext)) return Result.success()
    val owner=TrackingOwner.read(applicationContext)
    val generation=inputData.getString("generation")
    if (owner.optString("owner")!=inputData.getString("ownerDigest") || owner.optString("generation")!=generation) return Result.success()
    val host=(applicationContext as? ReactApplication)?.reactHost ?: return Result.retry()
    val workId=UUID.randomUUID().toString()
    val completion=Completion()
    completions[workId]=completion
    return try {
      val startup=host.start()
      if(!startup.waitForCompletion(30,TimeUnit.SECONDS) || startup.isFaulted()) return Result.retry()
      Handler(Looper.getMainLooper()).post {
        synchronized(TrackingOwner) {
        val latest=TrackingOwner.read(applicationContext)
        if(!TrackingOwner.active(applicationContext) || latest.optString("owner")!=owner.optString("owner") ||
            latest.optString("generation")!=generation) {finish(workId,true);return@post}
        val context=host.currentReactContext
        if(context==null) {finish(workId,false);return@post}
        val args=Arguments.createMap().apply {putString("ownerDigest",owner.optString("owner"));putString("generation",generation);putString("workId",workId)}
        runCatching {HeadlessJsTaskContext.getInstance(context).startTask(HeadlessJsTaskConfig("MasarifiTracking",args,90000,true))}
          .onFailure {finish(workId,false)}
        }
      }
      if(completion.latch.await(100,TimeUnit.SECONDS) && completion.succeeded) Result.success() else Result.retry()
    } finally {
      completions.remove(workId)
      synchronized(TrackingOwner) {
      val current=TrackingOwner.read(applicationContext)
      if(current.optString("owner")==owner.optString("owner") && current.optString("generation")==generation &&
          (current.optBoolean("sms") || current.optBoolean("notification"))) {
      if(NotificationQueue(applicationContext).read(1).isNotEmpty()) WorkManager.getInstance(applicationContext).enqueueUniqueWork("masarifi-tracking-drain-next",ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<NotificationDrainWorker>().setInitialDelay(5,TimeUnit.SECONDS).addTag("masarifi-tracking").build())
      // Replace the completed content-trigger work so the next SMS can wake the process.
      if (current.optBoolean("sms")) WorkManager.getInstance(applicationContext).enqueueUniqueWork("masarifi-tracking-sms-next",ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<SmsWatchWorker>().setInitialDelay(5,TimeUnit.SECONDS).addTag("masarifi-tracking").build())
      }
      }
    }
  }
  private class Completion {val latch=CountDownLatch(1);@Volatile var succeeded=false}
  companion object {
    private val completions=ConcurrentHashMap<String,Completion>()
    fun finish(workId:String,succeeded:Boolean) {completions[workId]?.let {it.succeeded=succeeded;it.latch.countDown()}}
  }
}
class SmsWatchWorker(context:Context,parameters:WorkerParameters):Worker(context,parameters) {
  override fun doWork():Result {TrackingScheduler.watchSms(applicationContext);return Result.success()}
}

class NotificationDrainWorker(context:Context,parameters:WorkerParameters):Worker(context,parameters) {
  override fun doWork():Result = synchronized(TrackingOwner) {
    if(TrackingOwner.active(applicationContext) && NotificationQueue(applicationContext).read(1).isNotEmpty()) TrackingScheduler.incoming(applicationContext)
    Result.success()
  }
}
