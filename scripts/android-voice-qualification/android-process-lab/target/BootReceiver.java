package com.masarifi.voicequalification.processfixture;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Mirrors the Expo receiver's default-process BOOT declaration, without task execution. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.i("VQSBroadcastLab", "BOOT_RECEIVER_DELIVERED");
        } else {
            Log.i("VQSBroadcastLab", "UNEXPECTED_ACTION");
        }
    }
}
