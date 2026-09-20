package com.masarifi.smsinbox

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NotificationQueueTest {
  private val now = 1_800_000_000_000L

  @Test
  fun capsExpiresAndAcknowledgesRecords() {
    val fresh = (1..201).map { index ->
      CapturedNotification("n-$index", "com.bank", "Bank", "Paid SAR $index", now - index)
    }
    val expired = CapturedNotification(
      "expired",
      "com.bank",
      "Bank",
      "Paid SAR 10",
      now - NotificationQueuePolicy.MAX_AGE_MS - 1
    )

    val pruned = NotificationQueuePolicy.prune(fresh + expired, now)
    assertEquals(200, pruned.size)
    assertFalse(pruned.any { it.key == "expired" })
    assertFalse(
      NotificationQueuePolicy.acknowledge(pruned, setOf("n-1"))
        .any { it.key == "n-1" }
    )
  }
}
