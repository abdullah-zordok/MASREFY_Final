package com.masarifi.voicequalification;

import java.nio.charset.StandardCharsets;

/** Fabricated preferences only. No Android, credential decryption or private output. */
public final class LaunchCleanupAdmissionTest {
    private static int cases;
    private static byte[] bytes(String value) {return value.getBytes(StandardCharsets.UTF_8);}
    private static void check(boolean condition) {cases++;if(!condition)throw new AssertionError("launch admission "+cases);}
    private static LocalAdmissionCollector launch() {
        var admission=new LocalAdmissionCollector("a".repeat(64),1800000000000L,1800000120000L,true);
        admission.owner("b".repeat(64),15,false);
        return admission;
    }
    private static SecureStoreKeyIndex index(String name) {
        return SecureStoreKeyIndex.combine(bytes("<map><string name=\""+name+"\">PRIVATE_SENTINEL</string></map>"),null);
    }
    public static void main(String[] args) {
        var empty=SecureStoreKeyIndex.combine(bytes("<map/>"),null);
        check(empty.launchPrivacyEntries().equals("ABSENT"));
        check(empty.launchJsOwnerContext().equals("ABSENT"));
        for(String prefix:new String[]{"","key_v1-"}) {
            for(String suffix:new String[]{"","."+"b".repeat(24)}) {
                for(String key:new String[]{"masarifi.appShell.privacyLock","masarifi.appShell.pinCredential"}) {
                    check(index(prefix+key+suffix).launchPrivacyEntries().equals("PRESENT"));
                }
            }
            check(index(prefix+"masarifi.tracking.background-context.v2").launchJsOwnerContext().equals("PRESENT"));
        }
        var fallback=SecureStoreKeyIndex.combine(bytes("<map/>"),bytes("<map><string name=\"masarifi.appShell.pinCredential\">PRIVATE_SENTINEL</string></map>"));
        check(fallback.launchPrivacyEntries().equals("PRESENT"));
        check(index("ordinary").launchPrivacyEntries().equals("ABSENT"));
        check(TrackingAdmissionClassifier.nativeContextState(null).equals("ABSENT"));
        check(TrackingAdmissionClassifier.nativeContextState(bytes("<map/>" )).equals("ABSENT"));
        check(TrackingAdmissionClassifier.nativeContextState(bytes("<map><boolean name=\"suspended\" value=\"true\"/></map>")).equals("ABSENT"));
        for(String context:new String[]{"","{}","PRIVATE_SENTINEL"}) {
            check(TrackingAdmissionClassifier.nativeContextState(bytes("<map><boolean name=\"suspended\" value=\"true\"/><string name=\"context\">"+context+"</string></map>")).equals("PRESENT"));
        }
        for(byte[] invalid:new byte[][]{bytes("<map>"),bytes("<!DOCTYPE map><map/>"),bytes("<map><string name=\"context\">a</string><string name=\"context\">b</string></map>"),new byte[]{(byte)0xff}}) {
            check(TrackingAdmissionClassifier.nativeContextState(invalid).equals("UNKNOWN"));
        }
        var unseen=launch();unseen.completeTracking(null);
        check(unseen.receipt().get("admissionVersion").equals("3"));
        check(unseen.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        for(String key:new String[]{"admissionLegacySmsQueue","admissionNativeOwnerContext","admissionJsOwnerContext","admissionPrivacyEntries"}) {
            check(unseen.receipt().get(key).equals("UNKNOWN"));
        }
        unseen.completeLaunch(empty,null);
        check(unseen.receipt().get("admissionLocalStatus").equals("OBSERVED_NO_LOCAL_BLOCKER"));
        check(unseen.receipt().size()==17);
        var legacy=launch();legacy.sourceRow("masarifi.tracking.smsImportQueue.v1","PRIVATE_SENTINEL");legacy.completeTracking(null);legacy.completeLaunch(empty,null);
        check(legacy.receipt().get("admissionLegacySmsQueue").equals("PRESENT"));
        check(legacy.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        check(!legacy.receipt().toString().contains("PRIVATE_SENTINEL"));
        for(String name:new String[]{"masarifi.appShell.pinCredential","masarifi.tracking.background-context.v2"}) {
            var present=launch();present.completeTracking(null);present.completeLaunch(index(name),null);
            check(present.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        }
        var context=launch();byte[] nativeXml=bytes("<map><boolean name=\"suspended\" value=\"true\"/><string name=\"context\">{}</string></map>");
        context.completeTracking(nativeXml);context.completeLaunch(empty,nativeXml);
        check(context.receipt().get("admissionNativeIntake").equals("INACTIVE"));
        check(context.receipt().get("admissionNativeOwnerContext").equals("PRESENT"));
        check(context.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        System.out.println("Launch cleanup admission cases: "+cases);
    }
}
