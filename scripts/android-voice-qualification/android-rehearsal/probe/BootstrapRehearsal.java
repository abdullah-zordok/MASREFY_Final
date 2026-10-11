package com.masarifi.voicequalification.rehearsal;

import android.app.Application;
import android.app.Instrumentation;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.os.Process;
import com.masarifi.voicequalification.AndroidProcessSurvey;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Disposable runtime test, not the private-data probe and not a Redmi artifact. */
public final class BootstrapRehearsal extends Instrumentation {
    private int expectedMarks;
    private String expectedHash;
    private String beforeApplicationProcessSurvey;
    @Override public Application newApplication(ClassLoader loader,String targetClassName,Context targetContext)
            throws InstantiationException,IllegalAccessException,ClassNotFoundException {
        // Retain Android's target Context and component factory while avoiding
        // construction/class initialization of the target Application subclass.
        beforeApplicationProcessSurvey=observeProcessSurvey(targetContext);
        return super.newApplication(loader,Application.class.getName(),targetContext);
    }
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        expectedMarks = Integer.parseInt(arguments.getString("expectedMarks"));
        expectedHash = arguments.getString("expectedHash","");
        start();
    }
    @Override public void onStart() {
        Bundle receipt = new Bundle();
        try {
            // onCreate starts a thread before ActivityThread calls Application.onCreate.
            // A main-loop barrier prevents a false PASS caused by that ordering race.
            CountDownLatch bound = new CountDownLatch(1);
            getTargetContext().getMainExecutor().execute(bound::countDown);
            if (!bound.await(5,TimeUnit.SECONDS)) throw new IllegalStateException("BOOTSTRAP_BARRIER");
            describeTarget(receipt);
            receipt.putString("beforeApplicationProcessSurvey",beforeApplicationProcessSurvey);
            receipt.putString("afterApplicationProcessSurvey",observeProcessSurvey(getTargetContext()));
            boolean pass = receipt.getBoolean("plainApplication") && receipt.getBoolean("correctProcess") &&
                    receipt.getBoolean("correctUid") && receipt.getBoolean("nonDebuggable") &&
                    receipt.getBoolean("marksUnchanged") && receipt.getBoolean("hashUnchanged");
            receipt.putString("verdict",pass ? "PASS_DISPOSABLE_BOOTSTRAP" : "FAIL_STARTUP_EFFECT");
            finish(pass ? -1 : 0,receipt);
        } catch (Exception failure) {
            receipt.putString("verdict","INDETERMINATE_BOOTSTRAP");
            finish(0,receipt);
        }
    }
    private static String observeProcessSurvey(Context context) {
        try {AndroidProcessSurvey.require(context,"com.masarifi.voicequalification.fixture:voicequalify");return "PASS_ONLY_PRIVATE_PROCESS";}
        catch(Throwable rejected) {
            String marker=rejected.getMessage();
            if(marker!=null && marker.matches("PROBE_IDENTITY_INDETERMINATE:PROCESS_[A-Z_]+"))return marker.substring(marker.indexOf(':')+1);
            return "PROCESS_SURVEY_EXCEPTION";
        }
    }
    private void describeTarget(Bundle receipt) throws Exception {
        Context target = getTargetContext();
        if (!"com.masarifi.voicequalification.fixture".equals(target.getPackageName())) throw new IllegalStateException("FIXTURE_ONLY");
        ApplicationInfo identity = target.getApplicationInfo();
        receipt.putBoolean("plainApplication",target.getApplicationContext().getClass() == Application.class);
        receipt.putBoolean("correctProcess","com.masarifi.voicequalification.fixture:voicequalify".equals(Application.getProcessName()));
        receipt.putBoolean("correctUid",identity.uid == Process.myUid());
        receipt.putBoolean("nonDebuggable",(identity.flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0);
        receipt.putBoolean("marksUnchanged",target.getSharedPreferences("tripwires",0).getInt("marks",-1) == expectedMarks);
        String hash = fixtureHash(Path.of(identity.dataDir,"shared_prefs","tripwires.xml"));
        receipt.putString("fixtureSha256",hash);
        receipt.putBoolean("hashUnchanged",expectedHash.isEmpty() || expectedHash.equals(hash));
    }
    private static String fixtureHash(Path path) throws Exception {
        if (!Files.isRegularFile(path) || Files.size(path) > 65536) throw new IllegalStateException("FIXTURE_FILE");
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path));
        StringBuilder hex = new StringBuilder(64);
        for (byte octet : bytes) hex.append(String.format(java.util.Locale.ROOT,"%02x",octet & 255));
        return hex.toString();
    }
}
