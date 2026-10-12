package com.masarifi.voicequalification;

import android.app.Application;
import android.app.Instrumentation;
import android.content.Context;
import android.content.pm.ComponentInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Existing-only real-target reader. No fixture seeder, app loader, writes or network code. */
public final class PrivateJournalDiagnostic extends Instrumentation {
    private String observedUid,approvedProbeHash,admissionNonce,admissionDeadline,launchAdmission;
    @Override public Application newApplication(ClassLoader loader,String name,Context context)
            throws InstantiationException,IllegalAccessException,ClassNotFoundException {
        PrivateProbeFailure.Stage stage=PrivateProbeFailure.Stage.UNEXPECTED;
        try {
            // Android installs matching providers before onCreate. Reject manifest/process
            // collisions and the wrong archived target BEFORE returning any Application.
            requireIdentity(context);
            stage=PrivateProbeFailure.Stage.PROCESS_SURVEY;requireOnlyPrivateProcess(context);
            stage=PrivateProbeFailure.Stage.APPLICATION_CLASS;
            if(!"com.masarifi.mobile.MainApplication".equals(name))throw failure();
            return super.newApplication(loader,Application.class.getName(),context);
        } catch(Throwable rejected) {throw PrivateProbeFailure.bootstrap(stage,rejected);}
    }
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        if(arguments!=null){observedUid=arguments.getString("observedTargetUid");approvedProbeHash=arguments.getString("approvedProbeSha256");admissionNonce=arguments.getString("admissionNonce");admissionDeadline=arguments.getString("admissionDeadline");launchAdmission=arguments.getString("launchAdmission");}
        start();
    }
    @Override public void onStart() {
        Bundle receipt=new Bundle();
        PrivateReaderFailure.Stage stage=PrivateReaderFailure.Stage.CONTEXT;
        try {
            Context context=getTargetContext();
            stage=PrivateReaderFailure.Stage.OBSERVED_BINDING;
            PrivateProbePolicy.requireObservedBinding(Process.myUid(),observedUid,approvedProbeHash,hash(Path.of(getContext().getApplicationInfo().sourceDir)));
            stage=PrivateReaderFailure.Stage.MAIN_LOOP_BARRIER;
            CountDownLatch barrier=new CountDownLatch(1);context.getMainExecutor().execute(barrier::countDown);
            if(!barrier.await(5,TimeUnit.SECONDS))throw failure();
            stage=PrivateReaderFailure.Stage.PLAIN_APPLICATION;
            if(context.getApplicationContext().getClass()!=Application.class)throw failure();
            stage=PrivateReaderFailure.Stage.IDENTITY_BEFORE;requireIdentity(context);
            if(launchAdmission!=null && (!"true".equals(launchAdmission) || admissionNonce==null || admissionDeadline==null))
                throw failure();
            if(admissionNonce!=null || admissionDeadline!=null)
                PrivateProbePolicy.requireAdmissionTarget(hash(Path.of(context.getApplicationInfo().sourceDir)));
            stage=PrivateReaderFailure.Stage.PROCESS_BEFORE;requireOnlyPrivateProcess(context);
            stage=PrivateReaderFailure.Stage.DATA_ROOT;Path root=dataRoot(context);
            stage=PrivateReaderFailure.Stage.INITIAL_STAMPS;Map<String,Stamp> before=stamps(root,List.of());
            stage=PrivateReaderFailure.Stage.NATIVE_LOAD;NativeSnapshotReader.loadLibrary();
            stage=PrivateReaderFailure.Stage.SNAPSHOT_CAPTURE;
            try(var snapshot=(admissionNonce!=null || admissionDeadline!=null)
                    ?VoiceStoreSnapshot.captureForAdmission(root):VoiceStoreSnapshot.capture(root)) {
                stage=PrivateReaderFailure.Stage.NATIVE_FILE_IDENTITY;
                if(!Boolean.TRUE.equals(snapshot.summary().get("nativeFileIdentityAvailable")))throw failure();
                stage=PrivateReaderFailure.Stage.SNAPSHOT_STAMPS;
                Map<String,Stamp> nativeBefore=stamps(root,snapshot.names());
                stage=PrivateReaderFailure.Stage.PROCESS_BEFORE_QUALIFICATION;requireOnlyPrivateProcess(context);
                stage=PrivateReaderFailure.Stage.KEYSTORE_OPEN;
                var keys=ExistingDatabaseKey.androidExistingOnly();
                stage=PrivateReaderFailure.Stage.QUALIFICATION;
                LocalAdmissionCollector admission=null;
                if(admissionNonce!=null || admissionDeadline!=null) {
                    if(admissionDeadline==null || !admissionDeadline.matches("[0-9]{1,16}"))throw failure();
                    admission=new LocalAdmissionCollector(admissionNonce,System.currentTimeMillis(),Long.parseLong(admissionDeadline),launchAdmission!=null);
                }
                var result=VoiceStoreQualification.qualify(snapshot,keys,NativeSnapshotReader::open,admission);
                stage=PrivateReaderFailure.Stage.SNAPSHOT_UNCHANGED;if(!snapshot.verifyUnchanged())throw failure();
                stage=PrivateReaderFailure.Stage.FILE_STAMPS_UNCHANGED;if(!nativeBefore.equals(stamps(root,snapshot.names())))throw failure();
                stage=PrivateReaderFailure.Stage.DIRECTORY_STAMPS_UNCHANGED;if(!before.equals(stamps(root,List.of())))throw failure();
                stage=PrivateReaderFailure.Stage.IDENTITY_AFTER;requireIdentity(context);
                stage=PrivateReaderFailure.Stage.PROCESS_AFTER;requireOnlyPrivateProcess(context);
                stage=PrivateReaderFailure.Stage.RECEIPT_BUILD;
                if(admission!=null)admission.receipt().forEach(receipt::putString);
                receipt.putString("verdict",result.verdict());receipt.putString("workSummary",result.workSummary());receipt.putString("fingerprint",result.fingerprint());
                receipt.putInt("owners",result.ownerDatabases());receipt.putInt("legacy",result.legacyDatabases());
                receipt.putInt("async",result.asyncDatabases());receipt.putInt("rows",result.rows());
                receipt.putInt("pending",result.pending());receipt.putInt("terminal",result.terminal());
                receipt.putInt("audioOwned",result.audioOwned());receipt.putInt("confirmationOwned",result.confirmationOwned());
                receipt.putInt("committedFrames",result.committedFrames());
                receipt.putString("targetApkSha256",hash(Path.of(context.getApplicationInfo().sourceDir)));receipt.putString("probeApkSha256",approvedProbeHash);
                receipt.putString("certificateSha256",PrivateProbePolicy.CERTIFICATE);receipt.putInt("targetUid",Process.myUid());
                receipt.putBoolean("unchanged",true);receipt.putBoolean("plainApplication",true);receipt.putBoolean("onlyPrivateProcess",true);
                stage=PrivateReaderFailure.Stage.SNAPSHOT_CLOSE;
            }
            stage=PrivateReaderFailure.Stage.FINISH;finish(-1,receipt);
        } catch(Throwable rejected) {receipt.clear();PrivateReaderFailure.receipt(stage,rejected).forEach(receipt::putString);finish(0,receipt);}
    }
    private void requireIdentity(Context context) throws Exception {
        PrivateProbeFailure.Stage stage=PrivateProbeFailure.Stage.TARGET_METADATA;
        try {
        PackageManager manager=context.getPackageManager();
        PackageInfo target=manager.getPackageInfo(PrivateProbePolicy.TARGET,PackageManager.GET_PROVIDERS|PackageManager.GET_ACTIVITIES|
                PackageManager.GET_RECEIVERS|PackageManager.GET_SERVICES|PackageManager.GET_SIGNING_CERTIFICATES|PackageManager.MATCH_DISABLED_COMPONENTS);
        stage=PrivateProbeFailure.Stage.PROBE_METADATA;
        PackageInfo probe=manager.getPackageInfo(PrivateProbePolicy.PROBE,PackageManager.GET_SIGNING_CERTIFICATES);
        stage=PrivateProbeFailure.Stage.TARGET_DECLARATION;
        PrivateProbePolicy.requireNoSplits(probe.splitNames);
        if(target.applicationInfo==null || probe.applicationInfo==null || target.sharedUserId!=null || !PrivateProbePolicy.PROBE.equals(getContext().getPackageName()) ||
                !PrivateProbePolicy.TARGET.equals(target.applicationInfo.processName) || target.getLongVersionCode()!=1 || !"0.0.1".equals(target.versionName) ||
                (probe.applicationInfo.flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)throw failure();
        List<String> providers=processes(target.providers);List<String> components=new ArrayList<>();
        components.addAll(processes(target.activities));components.addAll(processes(target.services));components.addAll(processes(target.receivers));
        var app=target.applicationInfo;
        stage=PrivateProbeFailure.Stage.TARGET_APK;String targetHash=hash(Path.of(app.sourceDir));
        stage=PrivateProbeFailure.Stage.TARGET_CERTIFICATE;String targetCertificate=certificate(target);
        stage=PrivateProbeFailure.Stage.PROBE_CERTIFICATE;String probeCertificate=certificate(probe);
        stage=PrivateProbeFailure.Stage.DATA_ROOT;String root=dataRoot(context).toString();
        stage=PrivateProbeFailure.Stage.IDENTITY_POLICY;
        PrivateProbePolicy.requireIdentity(new PrivateProbePolicy.Identity(context.getPackageName(),Application.getProcessName(),Build.VERSION.SDK_INT,
                Process.myUid(),app.uid,targetHash,targetCertificate,probeCertificate,app.className,app.appComponentFactory,
                (app.flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0,target.splitNames==null?0:target.splitNames.length,providers,components,root));
        } catch(Throwable rejected) {throw PrivateProbeFailure.reject(stage);}
    }
    private static List<String> processes(ComponentInfo[] components) {
        List<String> result=new ArrayList<>();if(components!=null)for(ComponentInfo component:components){if(component==null)throw failure();result.add(component.processName);}return result;
    }
    private static String certificate(PackageInfo info) throws Exception {
        if(info.signingInfo==null || info.signingInfo.hasMultipleSigners())throw failure();
        var signatures=info.signingInfo.getApkContentsSigners();if(signatures==null || signatures.length!=1)throw failure();
        byte[] encoded=signatures[0].toByteArray();try{return hex(MessageDigest.getInstance("SHA-256").digest(encoded));}finally{Arrays.fill(encoded,(byte)0);}
    }
    private static Path dataRoot(Context context) throws Exception {
        Path declared=Path.of(context.getApplicationInfo().dataDir);
        return PrivateProbePolicy.canonicalRoot(declared,Path.of("/data/user/0"),Path.of("/data/data"),path -> {
            var stamp=Os.lstat(path.toString());return OsConstants.S_ISDIR(stamp.st_mode)&&stamp.st_uid==Process.myUid();
        });
    }
    private static void requireOnlyPrivateProcess(Context context) {
        AndroidProcessSurvey.require(context,PrivateProbePolicy.PROCESS);
    }
    private record Stamp(long device,long inode,int uid,int mode,long size,long modified,long changed) {}
    private static Map<String,Stamp> stamps(Path root,Iterable<String> files) throws Exception {
        Map<String,Stamp> result=new TreeMap<>();
        for(String directory:List.of("","files","files/SQLite","databases","shared_prefs"))stamp(root,directory,true,result);
        for(String file:files)stamp(root,file,false,result);return result;
    }
    private static void stamp(Path root,String relative,boolean directory,Map<String,Stamp> result) throws Exception {
        try {
            var value=Os.lstat(root.resolve(relative).toString());
            if(value.st_uid!=Process.myUid() || (directory?!OsConstants.S_ISDIR(value.st_mode):!OsConstants.S_ISREG(value.st_mode)))throw failure();
            result.put(relative,new Stamp(value.st_dev,value.st_ino,value.st_uid,value.st_mode,value.st_size,value.st_mtime,value.st_ctime));
        } catch(ErrnoException absent) {if(!directory || relative.isEmpty() || absent.errno!=OsConstants.ENOENT)throw failure();}
    }
    private static String hash(Path apk) throws Exception {
        if(!Files.isRegularFile(apk,LinkOption.NOFOLLOW_LINKS))throw failure();long size=Files.size(apk);if(size<=0 || size>512L*1024*1024)throw failure();
        MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];long count=0;
        try(var input=Files.newInputStream(apk,LinkOption.NOFOLLOW_LINKS)){int length;while((length=input.read(buffer))!=-1){count+=length;if(count>size)throw failure();digest.update(buffer,0,length);}}
        finally{Arrays.fill(buffer,(byte)0);}if(count!=size || Files.size(apk)!=size)throw failure();return hex(digest.digest());
    }
    private static String hex(byte[] bytes){StringBuilder result=new StringBuilder(64);try{for(byte octet:bytes)result.append(String.format(java.util.Locale.ROOT,"%02x",octet&255));return result.toString();}finally{Arrays.fill(bytes,(byte)0);}}
    private static IllegalStateException failure(){return new IllegalStateException("PROBE_IDENTITY_INDETERMINATE");}
}
