package com.masarifi.voicequalification.processlab;

import android.app.Application;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import com.masarifi.voicequalification.AndroidProcessSurvey;

/** Synthetic evidence only: observe delayed broadcast peers without touching any store. */
public final class BroadcastSurvey extends Instrumentation {
    private static final String TARGET = "com.masarifi.voicequalification.processfixture";
    private static final String EXPECTED = TARGET + ":inspect";
    private static final String PASS = "PASS_ONLY_PRIVATE_PROCESS";
    private static final String MAIN = "PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE=TARGET_MAIN";
    private final Bundle receipt = new Bundle();

    @Override public Application newApplication(ClassLoader loader, String name, Context context)
            throws InstantiationException, IllegalAccessException, ClassNotFoundException {
        if (!TARGET.equals(context.getPackageName()) || !EXPECTED.equals(Application.getProcessName()) ||
                !Application.class.getName().equals(name)) throw new ClassNotFoundException("FIXTURE_ONLY");
        receipt.putString("initialSurvey", survey(context));
        return super.newApplication(loader, Application.class.getName(), context);
    }

    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        try {
            Context context = getTargetContext();
            receipt.putString("componentState", Integer.toString(context.getPackageManager().getComponentEnabledSetting(
                    new ComponentName(TARGET, TARGET + ".BootReceiver"))));
            int peers = MAIN.equals(receipt.getString("initialSurvey")) ? 1 : 0;
            // Fixed observation interval, never a retry-until-PASS and never journal access.
            for (int sample = 0; sample < 25; sample++) {
                Thread.sleep(200);
                if (MAIN.equals(survey(context))) peers++;
            }
            receipt.putString("peerSamples", Integer.toString(peers));
            receipt.putString("finalSurvey", survey(context));
            receipt.putString("verdict", "PASS_BROADCAST_OBSERVATION");
            finish(-1, receipt);
        } catch (Exception unavailable) {
            receipt.clear();
            receipt.putString("verdict", "INDETERMINATE_BROADCAST_OBSERVATION");
            finish(0, receipt);
        }
    }

    private static String survey(Context context) {
        try { AndroidProcessSurvey.require(context, EXPECTED); return PASS; }
        catch (RuntimeException rejected) {
            if (MAIN.equals(rejected.getMessage())) return MAIN;
            throw rejected;
        }
    }
}
