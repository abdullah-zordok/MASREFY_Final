package com.masarifi.smsinbox

import android.content.Context
import androidx.work.Configuration
import androidx.work.testing.WorkManagerTestInitHelper
import androidx.work.testing.TestWorkerBuilder
import androidx.work.WorkManager
import androidx.work.ListenableWorker
import java.util.concurrent.Executor
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec
import javax.crypto.spec.GCMParameterSpec

/** Real Android preferences and native reset path; only public synthetic ciphertext. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class TrackingOwnerRestoreTest {
  private val owner = "a".repeat(64)
  private val other = "b".repeat(64)
  private val generation = "11111111-1111-4111-8111-111111111111"
  private lateinit var context: Context
  private fun prefs(name: String) = context.getSharedPreferences(name, Context.MODE_PRIVATE)
  private fun ownerPrefs() = prefs("masarifi_tracking_owner_v2")
  private fun queue() = prefs("masarifi_notification_queue_v2_" + owner)
  private fun seed(): String {
    val state = JSONObject().put("owner",owner).put("generation",generation)
      .put("sms",true).put("notification",true).put("packages",org.json.JSONArray(listOf("com.bank.app")))
    ownerPrefs().edit().putString("context",state.toString()).commit()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    val iv = ByteArray(12) { 1 }
    cipher.init(Cipher.ENCRYPT_MODE,SecretKeySpec(ByteArray(32),"AES"),GCMParameterSpec(128,iv))
    val encoded = java.util.Base64.getEncoder().encodeToString(iv + cipher.doFinal("[public synthetic notification]".toByteArray()))
    queue().edit().putString("ciphertext",encoded).commit()
    prefs("masarifi_notification_queue_v1").edit().putString("records","[public legacy notification]").commit()
    prefs("masarifi_notification_queue_v2_" + other).edit().putString("ciphertext","unrelated").commit()
    return encoded
  }
  @Before fun setup() {
    context=RuntimeEnvironment.getApplication()
    WorkManagerTestInitHelper.initializeTestWorkManager(context,Configuration.Builder().build())
  }
  @Test fun sameOwnerColdRestorePreservesCiphertextAndLegacyRecords() {
    val ciphertext=seed();val original=ownerPrefs().getString("context",null)
    assertEquals("PRESERVED",TrackingOwner.restore(context,owner,generation))
    assertEquals(ciphertext,queue().getString("ciphertext",null))
    assertEquals("[public legacy notification]",prefs("masarifi_notification_queue_v1").getString("records",null))
    assertEquals(original,ownerPrefs().getString("context",null))
    assertFalse(TrackingOwner.read(context).optBoolean("sms"))
    assertFalse(TrackingOwner.allows(context,"com.bank.app"))
  }
  @Test fun differentAuthenticatedOwnerClearsOnlyPreviousOwnerQueue() {
    seed()
    prefs("masarifi_notification_queue_v2_" + other).edit().clear().commit()
    prefs("masarifi_notification_queue_v2_" + "c".repeat(64)).edit().putString("ciphertext","unrelated").commit()
    assertEquals("CLEARED",TrackingOwner.restore(context,other,null))
    assertFalse(queue().contains("ciphertext"))
    assertFalse(prefs("masarifi_notification_queue_v1").contains("records"))
    assertEquals("unrelated",prefs("masarifi_notification_queue_v2_" + "c".repeat(64)).getString("ciphertext",null))
    assertFalse(ownerPrefs().contains("context"));assertTrue(TrackingOwner.isSuspended(context))
  }
  @Test fun changingOwnerNeverAdoptsUnboundTargetCiphertextOrClearsPreviousQueue() {
    val ciphertext=seed()
    assertEquals("BLOCKED",TrackingOwner.restore(context,other,null))
    assertEquals(ciphertext,queue().getString("ciphertext",null))
    assertEquals("unrelated",prefs("masarifi_notification_queue_v2_"+other).getString("ciphertext",null))
    assertEquals(owner,TrackingOwner.read(context).optString("owner"))
    assertFalse(TrackingOwner.active(context))
  }
  @Test fun malformedContextAndUnmatchedGenerationNeverClearRetainedCiphertext() {
    for(raw in listOf("{", "{}", JSONObject().put("owner",owner).put("generation",generation)
        .put("sms",true).put("notification",true).toString())) {
      val ciphertext=seed();ownerPrefs().edit().putString("context",raw).commit()
      assertEquals("BLOCKED",TrackingOwner.restore(context,owner,"different-generation"))
      assertEquals(ciphertext,queue().getString("ciphertext",null))
      assertEquals(raw,ownerPrefs().getString("context",null))
      assertFalse(TrackingOwner.read(context).optBoolean("sms"))
      assertFalse(TrackingOwner.read(context).optBoolean("notification"))
    }
  }
  @Test fun cleanFirstLoginIsAllowedButUnboundLegacyDataBlocks() {
    assertEquals("EMPTY",TrackingOwner.restore(context,owner,null))
    prefs("masarifi_notification_queue_v1").edit().putString("records","[retained]").commit()
    assertEquals("BLOCKED",TrackingOwner.restore(context,owner,null))
    assertEquals("[retained]",prefs("masarifi_notification_queue_v1").getString("records",null))
  }
  @Test fun missingOwnerContextNeverAdoptsRetainedOwnerCiphertext() {
    val ciphertext=seed();ownerPrefs().edit().clear().commit()
    prefs("masarifi_notification_queue_v1").edit().clear().commit()
    assertEquals("BLOCKED",TrackingOwner.restore(context,owner,null))
    assertEquals(ciphertext,queue().getString("ciphertext",null))
  }
  @Test fun queuedReadsAcknowledgementsAndAddsCannotMutateSuspendedQueue() {
    val ciphertext=seed();TrackingOwner.restore(context,owner,generation)
    val notifications=NotificationQueue(context)
    for (operation in listOf<() -> Unit>(
      {notifications.read(1)},
      {notifications.acknowledge(setOf("notification"))},
      {notifications.add(CapturedNotification("notification","com.bank.app","title","text",1L))}
    )) {
      try {operation();fail("Suspended operation must reject")}
      catch (expected: IllegalStateException) {assertEquals("tracking_suspended",expected.message)}
    }
    assertEquals(ciphertext,queue().getString("ciphertext",null))
    assertEquals("[public legacy notification]",prefs("masarifi_notification_queue_v1").getString("records",null))
  }
  @Test fun explicitLogoutStillClearsPreservedQueue() {
    seed();TrackingOwner.restore(context,owner,generation);TrackingOwner.clear(context)
    assertFalse(queue().contains("ciphertext"));assertFalse(ownerPrefs().contains("context"))
    assertTrue(TrackingOwner.isSuspended(context))
  }
  @Test fun queuedOperationsAfterLogoutCannotCreateUnboundQueue() {
    seed();TrackingOwner.clear(context)
    try {NotificationQueue(context).read(1);fail("Post-logout read must reject")}
    catch (expected: IllegalStateException) {assertEquals("tracking_suspended",expected.message)}
    assertFalse(prefs("masarifi_notification_queue_v2_").contains("ciphertext"))
    assertEquals("EMPTY",TrackingOwner.restore(context,owner,null))
  }
  @Test fun suspendedWorkersDoNotReadPruneOrRescheduleDurableNotifications() {
    val ciphertext=seed()
    assertEquals("PRESERVED",TrackingOwner.restore(context,owner,generation))
    val executor=Executor { it.run() }
    val drain=TestWorkerBuilder.from(context,NotificationDrainWorker::class.java,executor).build()
    val tracking=TestWorkerBuilder.from(context,TrackingWorker::class.java,executor).build()
    val sms=TestWorkerBuilder.from(context,SmsWatchWorker::class.java,executor).build()
    assertEquals(ListenableWorker.Result.success(),drain.doWork())
    assertEquals(ListenableWorker.Result.success(),tracking.doWork())
    assertEquals(ListenableWorker.Result.success(),sms.doWork())
    TrackingScheduler.incoming(context)
    assertEquals(ciphertext,queue().getString("ciphertext",null))
    assertEquals("[public legacy notification]",prefs("masarifi_notification_queue_v1").getString("records",null))
    assertTrue(WorkManager.getInstance(context).getWorkInfosByTag("masarifi-tracking").get().isEmpty())
  }
}
