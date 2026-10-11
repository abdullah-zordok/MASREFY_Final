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
        return super.newApplication(loader,Application.class.getName(),context);
    }
    @Override public void onCreate(Bundle arguments) {super.onCreate(arguments);mode=arguments.getString("mode");start();}
    @Override public void onStart() {
        Bundle receipt=new Bundle();
        try {
            CountDownLatch barrier=new CountDownLatch(1);getTargetContext().getMainExecutor().execute(barrier::countDown);
            if(!barrier.await(5,TimeUnit.SECONDS))throw new IllegalStateException("BARRIER");
            Context target=getTargetContext();
            if(!"com.masarifi.voicequalification.fixture".equals(target.getPackageName()) ||
                    !"com.masarifi.voicequalification.fixture:voicequalify".equals(Application.getProcessName()) ||
                    target.getApplicationInfo().uid!=Process.myUid() || target.getApplicationContext().getClass()!=Application.class)
                throw new IllegalStateException("SYNTHETIC_TARGET_ONLY");
            Path fixtures=Path.of(target.getFilesDir().getAbsolutePath(),"vqs-synthetic-journals");
            if("seed".equals(mode)) {
                if(Files.exists(fixtures))throw new IllegalStateException("PRESERVE_FIXTURE_EVIDENCE");
                Files.createDirectory(fixtures);copyAssetTree("journals",fixtures);
                KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
                for(String alias:new String[]{"AES/GCM/NoPadding:key_v1","AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"}) {
                    if(store.containsAlias(alias))throw new IllegalStateException("PRESERVE_EXISTING_SYNTHETIC_ALIAS");
                }
                // Genuine existing-only AndroidKeyStore absence before the fixture imports.
                // The read must fail closed and leave files/aliases absent and unchanged.
                try(var snapshot=VoiceStoreSnapshot.capture(fixtures.resolve("empty-two-owners/input"))) {
                    boolean rejected=false;
                    try {VoiceStoreQualification.qualify(snapshot,ExistingDatabaseKey.androidExistingOnly(),NativeSnapshotReader::open);}
                    catch(IllegalStateException invalid) {rejected="STORE_INDETERMINATE".equals(invalid.getMessage())&&invalid.getCause()==null;}
                    require(rejected&&snapshot.verifyUnchanged());
                }
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
                NativeSnapshotReader.loadLibrary();
                var existing=ExistingDatabaseKey.androidExistingOnly();MessageDigest aggregate=MessageDigest.getInstance("SHA-256");
                int cases=0;
                try(var directories=Files.list(fixtures)) {
                    for(Path fixture:directories.sorted().toList()) {
                        if(!Files.isDirectory(fixture))throw new IllegalStateException("FIXTURE_INVENTORY");
                        Map<?,?> expected=(Map<?,?>)StrictJson.parse(Files.readString(fixture.resolve("fixture.json")));
                        Path root=fixture.resolve("input");
                        verifySyntheticUid(root);
                        try(var snapshot=VoiceStoreSnapshot.capture(root)) {
                            if(!Boolean.TRUE.equals(snapshot.summary().get("nativeFileIdentityAvailable")))throw new IllegalStateException("FILE_IDENTITY");
                            try {
                                var result=VoiceStoreQualification.qualify(snapshot,
                                        "missing".equals(expected.get("keyMode"))?alias -> null:existing,NativeSnapshotReader::open);
                                require(result.verdict().equals(expected.get("verdict")));
                                require(result.pending()==StrictJson.integer(expected.get("pending")) && result.terminal()==StrictJson.integer(expected.get("terminal")) &&
                                        result.audioOwned()==StrictJson.integer(expected.get("audioOwned")) && result.confirmationOwned()==StrictJson.integer(expected.get("confirmationOwned")));
                                if(Boolean.TRUE.equals(expected.get("wal")))require(result.committedFrames()>0);
                            } catch(IllegalStateException invalid) {
                                if(!"INDETERMINATE".equals(expected.get("verdict")) || !"STORE_INDETERMINATE".equals(invalid.getMessage()) || invalid.getCause()!=null)throw invalid;
                            }
                            require(snapshot.verifyUnchanged());verifySyntheticUid(root);
                            aggregate.update(((String)snapshot.summary().get("fingerprint")).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                        }
                        cases++;
                    }
                }
                require(cases>=30);receipt.putInt("cases",cases);receipt.putString("fixtureFingerprint",hex(aggregate.digest()));
                receipt.putString("verdict","PASS_DISPOSABLE_ENCRYPTED_JOURNALS");
            } else throw new IllegalStateException("MODE");
            finish(-1,receipt);
        } catch(Throwable failure) {receipt.clear();receipt.putString("verdict","INDETERMINATE_SYNTHETIC_JOURNALS");finish(0,receipt);}
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
