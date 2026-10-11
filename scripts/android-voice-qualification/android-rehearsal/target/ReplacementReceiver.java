package com.masarifi.voicequalification.fixture;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
/** Detect automatic product execution on package replacement in disposable CI only. */
public final class ReplacementReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { Tripwire.mark(context,"REPLACEMENT_RECEIVER"); }
}
