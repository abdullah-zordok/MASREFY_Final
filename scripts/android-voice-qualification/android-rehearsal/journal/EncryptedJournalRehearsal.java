package com.masarifi.voicequalification;

import android.app.Application;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import android.os.Process;
import android.security.keystore.KeyProperties;
import android.security.keystore.KeyProtection;
import android.system.Os;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import javax.crypto.spec.SecretKeySpec;

/** Synthetic-only Android test. The fixture writer is never shipped as a private-data probe. */
public final class EncryptedJournalRehearsal extends Instrumentation {
    private String mode;
    @Override public Application newApplication(ClassLoader loader,String name,Context context)
            throws InstantiationException,IllegalAccessException,ClassNotFoundException {
        AndroidProcessSurvey.require(context,"com.masarifi.voicequalification.fixture:voicequalify");
        return super.newApplication(loader,Application.class.getName(),context);
    }
    @Override public void onCreate(Bundle arguments) {super.onCreate(arguments);mode=arguments.getString("mode");start();}
    @Override public void onStart() {
        Bundle receipt=new Bundle();
        String phase="BOOTSTRAP_GUARDS";
        try {
            CountDownLatch barrier=new CountDownLatch(1);getTargetContext().getMainExecutor().execute(barrier::countDown);
            if(!barrier.await(5,TimeUnit.SECONDS))throw new IllegalStateException("BARRIER");
            Context target=getTargetContext();
            if(!"com.masarifi.voicequalification.fixture".equals(target.getPackageName()) ||
                    !"com.masarifi.voicequalification.fixture:voicequalify".equals(Application.getProcessName()) ||
                    target.getApplicationInfo().uid!=Process.myUid() || target.getApplicationContext().getClass()!=Application.class)
                throw new IllegalStateException("SYNTHETIC_TARGET_ONLY");
            AndroidProcessSurvey.require(target,"com.masarifi.voicequalification.fixture:voicequalify");
            receipt.putString("packageState",Integer.toString(target.getPackageManager().getApplicationEnabledSetting(target.getPackageName())));
            receipt.putString("applicationEnabled",Boolean.toString(target.getPackageManager().getApplicationInfo(target.getPackageName(),0).enabled));
            phase="RESOLVE_SYNTHETIC_ROOT";
            Path dataRoot=SyntheticRootResolver.canonicalRoot(Path.of(target.getApplicationInfo().dataDir),
                    Path.of("/data/user/0"),Path.of("/data/data"),path -> {
                        var stamp=Os.lstat(path.toString());
                        return stamp.st_uid==Process.myUid() && android.system.OsConstants.S_ISDIR(stamp.st_mode);
                    });
            Path fixtures=dataRoot.resolve("files/vqs-synthetic-journals");
            // Descendant links remain forbidden; only the system user0 root alias is normalized.
            require(dataRoot.resolve("files").equals(Path.of(target.getFilesDir().getAbsolutePath()).toRealPath()));
            if("seed".equals(mode)) {
                phase="COPY_PUBLIC_FIXTURES";
                if(Files.exists(fixtures))throw new IllegalStateException("PRESERVE_FIXTURE_EVIDENCE");
                Files.createDirectory(fixtures);copyAssetTree("journals",fixtures);
                phase="ANDROID_COMMITTED_ROLLBACK_JOURNALS";
                receipt.putInt("androidRollbackJournalCases",writeAndroidCommittedJournals(fixtures));
                phase="KEYSTORE_ABSENCE";
                KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
                for(String alias:new String[]{"AES/GCM/NoPadding:key_v1","AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"}) {
                    if(store.containsAlias(alias))throw new IllegalStateException("PRESERVE_EXISTING_SYNTHETIC_ALIAS");
                }
                // Genuine existing-only AndroidKeyStore absence before the fixture imports.
                // The read must fail closed and leave files/aliases absent and unchanged.
                phase="CAPTURE_MISSING_ALIAS_FIXTURE";
                try(var snapshot=VoiceStoreSnapshot.capture(fixtures.resolve("empty-two-owners/input"))) {
                    phase="QUALIFY_MISSING_ALIAS_FIXTURE";
                    boolean rejected=false;
                    try {VoiceStoreQualification.qualify(snapshot,ExistingDatabaseKey.androidExistingOnly(),NativeSnapshotReader::open);}
                    catch(IllegalStateException invalid) {rejected="STORE_INDETERMINATE".equals(invalid.getMessage())&&invalid.getCause()==null;}
                    require(rejected&&snapshot.verifyUnchanged());
                }
                phase="IMPORT_PUBLIC_SYNTHETIC_KEYS";
                for(String alias:new String[]{"AES/GCM/NoPadding:key_v1","AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"}) {
                    if(store.containsAlias(alias))throw new IllegalStateException("KEY_LOOKUP_CREATED_ALIAS");
                    // This intentionally writes public fixture keys, only inside the guarded synthetic UID.
                    store.setEntry(alias,new KeyStore.SecretKeyEntry(new SecretKeySpec(new byte[32],"AES")),
                            new KeyProtection.Builder(KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(false).build());
                }
                receipt.putBoolean("missingExistingAliasesFailClosed",true);
                receipt.putString("verdict","SEEDED_PUBLIC_SYNTHETIC_FIXTURES");
            } else if("qualify".equals(mode)) {
                phase="READER_STAGE_REPORTING";
                receipt.putInt("readerStageCases",ReaderFailureRehearsal.verify());
                phase="LOAD_RAM_READER";
                NativeSnapshotReader.loadLibrary();
                phase="QUALIFY_ENCRYPTED_FIXTURES";
                var existing=ExistingDatabaseKey.androidExistingOnly();MessageDigest aggregate=MessageDigest.getInstance("SHA-256");
                int cases=0,qualificationStageCases=0,workSummaryCases=0,admissionCases=0,launchAdmissionCases=0;
                try(var directories=Files.list(fixtures)) {
                    for(Path fixture:directories.sorted().toList()) {
                        if(!Files.isDirectory(fixture))throw new IllegalStateException("FIXTURE_INVENTORY");
                        Map<?,?> expected=(Map<?,?>)StrictJson.parse(SyntheticFixtureMetadata.read(fixture.resolve("fixture.json")));
                        Path root=fixture.resolve("input");
                        verifySyntheticUid(root);
                        try(var legacySnapshot=VoiceStoreSnapshot.capture(root);
                            var snapshot=VoiceStoreSnapshot.captureForAdmission(root)) {
                            require(snapshot.summary().equals(legacySnapshot.summary()));
                            if(!Boolean.TRUE.equals(snapshot.summary().get("nativeFileIdentityAvailable")))throw new IllegalStateException("FILE_IDENTITY");
                            try {
                                long admissionNow=System.currentTimeMillis();
                                var admission=new LocalAdmissionCollector("a".repeat(64),admissionNow,admissionNow+120000);
                                var result=VoiceStoreQualification.qualify(snapshot,
                                        "missing".equals(expected.get("keyMode"))?alias -> null:existing,NativeSnapshotReader::open,admission);
                                require(result.verdict().equals(expected.get("verdict")));
                                Bundle admissionBundle=new Bundle();admission.receipt().forEach(admissionBundle::putString);
                                require(expected.get("admission") instanceof Map<?,?>);
                                Map<?,?> expectedAdmission=(Map<?,?>)expected.get("admission");
                                require(expectedAdmission.keySet().equals(java.util.Set.of("admissionVersion","admissionVerdict",
                                        "admissionLocalStatus","admissionPrunableBatches","admissionFinancePending",
                                        "admissionTrackingRows","admissionSchemaCurrent","admissionLegacyCleanup",
                                        "admissionTrackingSources","admissionNativeIntake")));
                                for(var field:expectedAdmission.entrySet())
                                    require(field.getValue().equals(admissionBundle.getString((String)field.getKey())));
                                var admissionFields=new java.util.HashSet<Object>(expectedAdmission.keySet());
                                admissionFields.addAll(java.util.Set.of("admissionNonce","admissionObservedAt","admissionDeadline"));
                                require(admissionBundle.keySet().equals(admissionFields));
                                require("a".repeat(64).equals(admissionBundle.getString("admissionNonce")));
                                require(Long.toString(admissionNow).equals(admissionBundle.getString("admissionObservedAt")));
                                require(Long.toString(admissionNow+120000).equals(admissionBundle.getString("admissionDeadline")));
                                admissionCases++;
                                var launchAdmission=new LocalAdmissionCollector("b".repeat(64),admissionNow,admissionNow+120000,true);
                                var launchResult=VoiceStoreQualification.qualify(snapshot,existing,NativeSnapshotReader::open,launchAdmission);
                                require(launchResult.equals(result));
                                var launchReceipt=launchAdmission.receipt();
                                require(expected.get("launchAdmission") instanceof Map<?,?>);
                                Map<?,?> expectedLaunch=(Map<?,?>)expected.get("launchAdmission");
                                var launchFields=new java.util.HashSet<Object>(expectedAdmission.keySet());
                                launchFields.addAll(java.util.Set.of("admissionLegacySmsQueue","admissionNativeOwnerContext",
                                        "admissionJsOwnerContext","admissionPrivacyEntries"));
                                require(expectedLaunch.keySet().equals(launchFields));
                                for(var field:expectedLaunch.entrySet())require(field.getValue().equals(launchReceipt.get(field.getKey())));
                                launchFields.addAll(java.util.Set.of("admissionNonce","admissionObservedAt","admissionDeadline"));
                                require(launchReceipt.keySet().equals(launchFields));
                                require("b".repeat(64).equals(launchReceipt.get("admissionNonce")));
                                require(Long.toString(admissionNow).equals(launchReceipt.get("admissionObservedAt")));
                                require(Long.toString(admissionNow+120000).equals(launchReceipt.get("admissionDeadline")));
                                require(snapshot.summary().equals(legacySnapshot.summary()) && snapshot.verifyUnchanged());
                                launchAdmissionCases++;
                                require(result.pending()==StrictJson.integer(expected.get("pending")) && result.terminal()==StrictJson.integer(expected.get("terminal")) &&
                                        result.audioOwned()==StrictJson.integer(expected.get("audioOwned")) && result.confirmationOwned()==StrictJson.integer(expected.get("confirmationOwned")));
                                ReaderFailureRehearsal.verifyWorkSummary(result.workSummary(),(String)expected.get("workSummary"));workSummaryCases++;
                                if(Boolean.TRUE.equals(expected.get("wal")))require(result.committedFrames()>0);
                            } catch(IllegalStateException invalid) {
                                if(!"INDETERMINATE".equals(expected.get("verdict")) || !"STORE_INDETERMINATE".equals(invalid.getMessage()) || invalid.getCause()!=null)throw invalid;
                                ReaderFailureRehearsal.verifyQualification(invalid,(String)expected.get("qualificationStage"));
                                qualificationStageCases++;
                            }
                            require(snapshot.verifyUnchanged() && legacySnapshot.verifyUnchanged());verifySyntheticUid(root);
                            aggregate.update(((String)snapshot.summary().get("fingerprint")).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                        }
                        cases++;
                    }
                }
                require(cases>=30);receipt.putInt("launchAdmissionVersion",3);receipt.putInt("launchAdmissionCases",launchAdmissionCases);receipt.putInt("admissionCases",admissionCases);receipt.putInt("cases",cases);receipt.putInt("qualificationStageCases",qualificationStageCases);receipt.putInt("workSummaryCases",workSummaryCases);receipt.putString("fixtureFingerprint",hex(aggregate.digest()));
                receipt.putString("verdict","PASS_DISPOSABLE_ENCRYPTED_JOURNALS");
            } else throw new IllegalStateException("MODE");
            finish(-1,receipt);
        } catch(Throwable failure) {
            receipt.clear();receipt.putString("verdict","INDETERMINATE_SYNTHETIC_JOURNALS");receipt.putString("phase",phase);
            receipt.putString("failureCategory",failure instanceof NoSuchMethodError?"MISSING_PLATFORM_METHOD":
                    failure instanceof UnsatisfiedLinkError?"NATIVE_NOT_LOADED":failure instanceof OutOfMemoryError?"MEMORY_LIMIT":
                    failure instanceof LinkageError?"PLATFORM_LINKAGE":failure instanceof IllegalStateException?"FAIL_CLOSED":
                    failure instanceof java.io.IOException?"SYNTHETIC_IO":"PLATFORM_REJECTION");
            finish(0,receipt);
        }
    }
    private static int writeAndroidCommittedJournals(Path fixtures) throws Exception {
        int count=0;
        for(String mode:new String[]{"TRUNCATE","PERSIST"})for(String outcome:new String[]{"clear","pending"}) {
            Path root=fixtures.resolve("rollback-async-"+mode.toLowerCase(java.util.Locale.ROOT)+"-"+outcome).resolve("input");
            verifySyntheticUid(root);
            Path file=root.resolve("databases/RKStorage");
            // Called only while seeding the separately guarded synthetic UID. Never shipped in the reader.
            try(var database=android.database.sqlite.SQLiteDatabase.openDatabase(file.toString(),null,
                    android.database.sqlite.SQLiteDatabase.OPEN_READWRITE|android.database.sqlite.SQLiteDatabase.NO_LOCALIZED_COLLATORS)) {
                try(var result=database.rawQuery("PRAGMA journal_mode="+mode,null)) {
                    require(result.moveToFirst()&&mode.equalsIgnoreCase(result.getString(0)));
                }
                database.beginTransaction();
                try {
                    database.execSQL("INSERT INTO catalystLocalStorage VALUES('public-android-writer','synthetic')");
                    database.execSQL("DELETE FROM catalystLocalStorage WHERE key='public-android-writer'");
                    database.setTransactionSuccessful();
                } finally {database.endTransaction();}
            }
            byte[] journal=Files.readAllBytes(root.resolve("databases/RKStorage-journal"));
            if(mode.equals("TRUNCATE"))require(journal.length==0);
            else {
                require(journal.length>512);
                for(int index=0;index<28;index++)require(journal[index]==0);
                boolean tail=false;for(int index=28;index<journal.length;index++)tail|=journal[index]!=0;
                require(tail);
            }
            verifySyntheticUid(root);count++;
        }
        return count;
    }
    private void copyAssetTree(String asset,Path destination) throws Exception {
        String[] names=getContext().getAssets().list(asset);
        if(names==null)throw new IllegalStateException("ASSET");
        for(String name:names) {
            if(!name.matches("[a-zA-Z0-9_.-]+") || name.equals(".") || name.equals(".."))throw new IllegalStateException("ASSET_NAME");
            String child=asset+"/"+name;Path path=destination.resolve(name);
            if(getContext().getAssets().list(child).length>0) {Files.createDirectory(path);copyAssetTree(child,path);}
            else {try(var input=getContext().getAssets().open(child)){Files.copy(input,path);}}
        }
    }
    private static void verifySyntheticUid(Path root) throws Exception {
        try(var paths=Files.walk(root)) {for(Path path:paths.toList()) {
            var stamp=Os.lstat(path.toString());if(stamp.st_uid!=Process.myUid() || android.system.OsConstants.S_ISLNK(stamp.st_mode))throw new IllegalStateException("FILE_UID");
        }}
    }
    private static void require(boolean okay){if(!okay)throw new IllegalStateException("FIXTURE_ASSERTION");}
    private static String hex(byte[] bytes){StringBuilder value=new StringBuilder(64);for(byte octet:bytes)value.append(String.format(java.util.Locale.ROOT,"%02x",octet&255));Arrays.fill(bytes,(byte)0);return value.toString();}
}
