package com.masarifi.voicequalification;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import javax.crypto.spec.SecretKeySpec;

/** Actual encrypted/WAL/key/whole-store integration using public synthetic AES keys only. */
public final class NativeWholeStoreTest {
    public static void main(String[] args) throws Exception {
        System.load(Path.of(args[0]).toAbsolutePath().toString());
        int checks=0;
        try(var cases=Files.list(Path.of(args[1]))) {
            for(Path fixture:cases.sorted().toList()) {
                if(!Files.isDirectory(fixture))continue;
                var expected=(Map<?,?>)StrictJson.parse(Files.readString(fixture.resolve("fixture.json")));
                Path root=fixture.resolve("input");
                StringBuilder xml=new StringBuilder("<map>");
                int ordinal=0;
                for(Object owner:(java.util.List<?>)expected.get("owners")) {
                    boolean current=ordinal++%2==0;
                    String envelope=VoiceStoreQualificationTest.envelope("wrong".equals(expected.get("keyMode"))?"02".repeat(32):"01".repeat(32));
                    if(current)envelope=envelope.replace("\"tlen\":128","\"tlen\":128,\"usesKeystoreSuffix\":true");
                    xml.append(entry((current?"key_v1-":"")+"masarifi.database.key."+owner,envelope));
                }
                if(expected.get("claim")!=null)xml.append(entry("key_v1-masarifi.database.legacyOwnerHash",
                        VoiceStoreQualificationTest.envelope("uppercase-claim".equals(expected.get("keyMode"))?
                                ((String)expected.get("claim")).toUpperCase(java.util.Locale.ROOT):(String)expected.get("claim"))
                                .replace("\"tlen\":128","\"tlen\":128,\"usesKeystoreSuffix\":true")));
                xml.append("</map>");Files.createDirectories(root.resolve("shared_prefs"));
                Files.writeString(root.resolve("shared_prefs/SecureStore.xml"),xml);
                String wanted=(String)expected.get("verdict");
                try(var snapshot=VoiceStoreSnapshot.capture(root)) {
                    try {
                        var result=VoiceStoreQualification.qualify(snapshot,alias -> "missing".equals(expected.get("keyMode"))?null:
                                new SecretKeySpec(new byte[32],"AES"),NativeSnapshotReader::open);
                        require(result.verdict().equals(wanted),"NATIVE_WHOLE_STORE_VERDICT");
                        for(String field:new String[]{"pending","terminal","audioOwned","confirmationOwned"})
                            require(((Integer)result.getClass().getDeclaredMethod(field).invoke(result)).longValue()==StrictJson.integer(expected.get(field)),"NATIVE_WHOLE_STORE_COUNTS");
                        require(result.workSummary().equals(expected.get("workSummary")),"WORK_SUMMARY_MISMATCH");
                        if(Boolean.TRUE.equals(expected.get("wal")))require(result.committedFrames()>0,"COMMITTED_WAL_NOT_COVERED");
                        require(!result.toString().contains("11111111")&&!result.toString().contains("private"),"PRIVATE_RECEIPT");
                    } catch(IllegalStateException indeterminate) {
                        require(wanted.equals("INDETERMINATE")&&indeterminate.getCause()==null&&indeterminate.getMessage().equals("STORE_INDETERMINATE"),"UNEXPECTED_INDETERMINATE");
                        require(VoiceStoreQualification.stageOf(indeterminate)!=null && VoiceStoreQualification.stageOf(indeterminate).name().equals(expected.get("qualificationStage")),"QUALIFICATION_STAGE_MISMATCH");
                    }
                    require(snapshot.verifyUnchanged(),"ORIGINAL_FIXTURE_CHANGED");
                }
                checks++;
            }
        }
        require(checks>=30,"INCOMPLETE_NATIVE_CASES");
        System.out.println("PASS: "+checks+" actual RAM-only SQLCipher/JNI whole-store cases; synthetic keys only");
    }
    private static String entry(String name,String value){return "<string name='"+name+"'>"+value.replace("&","&amp;").replace("<","&lt;")+"</string>";}
    private static void require(boolean condition,String code){if(!condition)throw new AssertionError(code);}
}
