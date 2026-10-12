package com.masarifi.voicequalification;

import java.util.List;
import java.nio.file.Path;

/** Exact archived and qualified upgrade artifacts; not current-device observations. */
final class PrivateProbePolicy {
    static final String TARGET="com.masarifi.mobile";
    static final String PROCESS=TARGET+":voicequalify";
    static final String PROBE="com.masarifi.voicequalification.diagnostic";
    static final String HISTORICAL_APK="0c0dd12035bd22eeb6f45b1597731462b967533cb394a23d3f9430a0d7a78685";
    static final String UPGRADE_APK="be33158e282efa4d8ae6b5f1ad9541e1a90ac9a3a42d0d830bbbf7d601346c9f";
    static final String PRESERVATION_APK="23a5653f5d5c1351189b1bc7f3de4a71c47a391b69bdb9c29edd49267b9aad83";
    static final String CERTIFICATE="fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c";
    record Identity(String packageName,String process,int api,int uid,int targetUid,String targetApk,
                    String certificate,String probeCertificate,String application,String factory,
                    boolean debuggable,int splits,List<String> providers,List<String> components,String dataRoot) {}
    static void requireNoSplits(String[] splitNames) {
        // API35 PackageInfo may use an empty array for a base-only installation.
        if(splitNames!=null && splitNames.length!=0)throw failure();
    }
    static void requireIdentity(Identity value) {
        if(value==null || !TARGET.equals(value.packageName) || !PROCESS.equals(value.process) || value.api!=35 ||
            value.uid<10000 || value.uid!=value.targetUid || !(HISTORICAL_APK.equals(value.targetApk)||UPGRADE_APK.equals(value.targetApk)||PRESERVATION_APK.equals(value.targetApk)) ||
            !CERTIFICATE.equals(value.certificate) || !CERTIFICATE.equals(value.probeCertificate) ||
            !"com.masarifi.mobile.MainApplication".equals(value.application) ||
            !"androidx.core.app.CoreComponentFactory".equals(value.factory) || value.debuggable || value.splits!=0 ||
            value.providers==null || value.providers.size()!=4 || !allMain(value.providers) ||
            value.components==null || value.components.isEmpty() || !allMain(value.components) ||
            !List.of("/data/user/0/com.masarifi.mobile","/data/data/com.masarifi.mobile").contains(value.dataRoot))throw failure();
    }
    @FunctionalInterface interface DirectoryCheck {boolean ownedDirectory(Path path) throws Exception;}
    // Only the two OS user0 package roots may be equivalent. The final package
    // directory itself must pass lstat ownership/type checks without following a link.
    static Path canonicalRoot(Path declared,Path user0Parent,Path legacyParent,DirectoryCheck check) {
        try {
            if(declared==null || user0Parent==null || legacyParent==null || check==null)throw failure();
            Path user=user0Parent.resolve(TARGET),legacy=legacyParent.resolve(TARGET);
            if(!declared.isAbsolute() || !declared.equals(declared.normalize()) ||
                    (!declared.equals(user)&&!declared.equals(legacy)) || !check.ownedDirectory(declared))throw failure();
            Path canonical=declared.toRealPath();
            if((!canonical.equals(user)&&!canonical.equals(legacy)) || !check.ownedDirectory(canonical))throw failure();
            return canonical;
        } catch(Exception rejected){throw failure();}
    }
    // Instrumentation arguments arrive after newApplication. This binding is required
    // before capturing a store, loading the reader, or looking up existing keys.
    static void requireObservedBinding(int uid,String observedUid,String approvedProbeHash,String actualProbeHash) {
        if(uid<10000 || !Integer.toString(uid).equals(observedUid) || approvedProbeHash==null ||
                !approvedProbeHash.matches("[0-9a-f]{64}") || !approvedProbeHash.equals(actualProbeHash))throw failure();
    }
    private static boolean allMain(List<String> processes){return processes.stream().allMatch(TARGET::equals);}
    private static IllegalStateException failure(){return new IllegalStateException("PROBE_IDENTITY_INDETERMINATE");}
}
