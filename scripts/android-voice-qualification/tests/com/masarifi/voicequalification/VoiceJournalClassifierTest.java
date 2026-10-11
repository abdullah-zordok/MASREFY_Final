package com.masarifi.voicequalification;

import java.lang.reflect.InvocationTargetException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pinned application journal semantics using public synthetic entries only. */
public final class VoiceJournalClassifierTest {
    private static final String ID = "11111111-1111-4111-8111-111111111111";
    private static final String OTHER = "22222222-2222-4222-8222-222222222222";
    private static Class<?> classifier;
    private static int checks;
    public static void main(String[] args) throws Exception {
        try { classifier = Class.forName("com.masarifi.voicequalification.VoiceJournalClassifier"); }
        catch (ClassNotFoundException missing) { throw new AssertionError("journal classifier is not implemented", missing); }
        for (String phase : new String[]{"captured","created","uploaded","processing","cancel_requested","completed","cancelled","failed"}) {
            boolean terminal = phase.equals("completed") || phase.equals("cancelled") || phase.equals("failed");
            Object row = batch(batchPayload(phase));
            checked(flag(row,"terminal") == terminal && flag(row,"pending") != terminal &&
                    flag(row,"blocksLaunch") != terminal, "all batch phases classified");
            row = batch(batchPayload(phase).replace("\"audioReference\":null", "\"audioReference\":\"synthetic-private-audio\""));
            checked(flag(row,"audioOwned") && flag(row,"blocksLaunch"), "retained batch audio blocks even terminal rows");
        }
        Object row = batch(batchPayload("completed").replace("\"audioReference\":null", "\"audioReference\":\"\""));
        checked(flag(row,"audioOwned") && flag(row,"blocksLaunch"), "non-null empty audio remains retained evidence");
        for (String phase : new String[]{"captured","creating","created","uploaded","processing","reviewing","confirming", "confirmation_unknown","saved","cancel_requested","cancelled","terminal"}) {
            boolean terminal = phase.equals("saved") || phase.equals("cancelled") || phase.equals("terminal");
            row = singleton(singletonPayload(phase));
            boolean confirmation = phase.equals("confirming") || phase.equals("confirmation_unknown");
            checked(flag(row,"terminal") == terminal && flag(row,"pending") != terminal &&
                    flag(row,"confirmationOwned") == confirmation && flag(row,"blocksLaunch") == (!terminal || confirmation),
                    "all singleton phases classified");
        }
        for (String phase : new String[]{"saved","cancelled","terminal"}) {
            row = singleton(singletonPayload(phase).replace("\"confirmationBody\":null", "\"confirmationBody\":{}"));
            checked(flag(row,"confirmationOwned") && flag(row,"blocksLaunch"), "terminal frozen confirmation remains blocked");
            row = singleton(singletonPayload(phase).replace("\"confirmationKey\":null", "\"confirmationKey\":\""+OTHER+"\""));
            checked(flag(row,"confirmationOwned") && flag(row,"blocksLaunch"), "frozen key alone remains blocked");
            row = singleton(singletonPayload(phase).replace("\"audioReference\":null", "\"audioReference\":\"synthetic-private-audio\""));
            checked(flag(row,"audioOwned") && flag(row,"blocksLaunch"), "singleton retained audio blocks");
        }
        row = singleton(singletonPayload("processing").replace("\"createBody\":null", "\"createBody\":"+captureBody())
                .replace("\"processBody\":null", "\"processBody\":{\"uploadCompleted\":true,\"expectedVersion\":3,\"contentHash\":\""+"a".repeat(64)+"\"}"));
        checked(flag(row,"pending"), "actual capture/process body contract accepted");
        row = batch(batchPayload("completed").replace("\"createBody\":null", "\"createBody\":{\"label\":\"قهوة 😀\",\"nested\":[null,true,1]}"));
        checked(!flag(row,"blocksLaunch") && !row.toString().contains("قهوة"), "terminal record body is opaque and result sanitized");
        String legacy = "{\"sessionId\":\""+ID+"\",\"sessionVersion\":1,\"recordedAt\":0,\"timezoneOffsetMinutes\":0,\"createdAt\":0}";
        row = invoke("legacy",new Class<?>[]{String.class,String.class},"masarifi.voice.pending."+"a".repeat(24),legacy);
        checked(flag(row,"pending") && flag(row,"blocksLaunch"), "valid legacy entry always blocks");
        reject("legacy",new Class<?>[]{String.class,String.class},"masarifi.voice.pending."+"a".repeat(23),legacy);
        reject("legacy",new Class<?>[]{String.class,String.class},"masarifi.voice.pending."+"A".repeat(24),legacy);
        reject("legacy",new Class<?>[]{String.class,String.class},"masarifi.voice.pending."+"a".repeat(24),"{}");
        for (String invalid : new String[]{"null","[]","{}","",batchPayload("unknown"),
                batchPayload("captured").replace("\"revision\":2","\"revision\":2.5"),
                batchPayload("captured").replace("\"durationMs\":1000","\"durationMs\":0"),
                batchPayload("captured").replace("\"durationMs\":1000","\"durationMs\":60001"),
                batchPayload("captured").replace("\"recordedAt\":0","\"recordedAt\":-1"),
                batchPayload("captured").replace("\"timezoneOffsetMinutes\":0","\"timezoneOffsetMinutes\":841"),
                batchPayload("captured").replace("\"locale\":\"ar\"","\"locale\":\"fr\""),
                batchPayload("captured").replace("\"version\":null","\"version\":0"),
                batchPayload("captured").replace("\"sessionId\":null","\"sessionId\":\"private-invalid-id\""),
                batchPayload("captured").replace("\"audioReference\":null","\"audioReference\":false"),
                batchPayload("captured").replace("\"createBody\":null","\"createBody\":[]"),
                batchPayload("captured").replace("\"processBody\":null","\"processBody\":true"),
                batchPayload("captured").replace("\"phase\":\"captured\"","\"phase\":\"captured\",\"phase\":\"completed\""),
                batchPayload("captured").replace("\"locale\":\"ar\",", ""),
                batchPayload("captured").replace("\"id\":", "\"unknown\":null,\"id\":")})
            reject("batch",new Class<?>[]{String.class,long.class,String.class},ID,2L,invalid);
        reject("batch",new Class<?>[]{String.class,long.class,String.class},OTHER,2L,batchPayload("completed"));
        reject("batch",new Class<?>[]{String.class,long.class,String.class},ID,3L,batchPayload("completed"));
        for (String invalid : new String[]{singletonPayload("unknown"),
                singletonPayload("processing").replace("\"createdAt\":0","\"createdAt\":9007199254740992"),
                singletonPayload("processing").replace("\"audioReference\":null","\"audioReference\":\"\""),
                singletonPayload("processing").replace("\"sessionVersion\":null","\"sessionVersion\":-1"),
                singletonPayload("processing").replace("\"confirmationBody\":null","\"confirmationBody\":[]"),
                singletonPayload("processing").replace("\"createBody\":null","\"createBody\":{}"),
                singletonPayload("processing").replace("\"processBody\":null","\"processBody\":{\"uploadCompleted\":false,\"expectedVersion\":1,\"contentHash\":\""+"a".repeat(64)+"\"}"),
                singletonPayload("saved").replace("\"transactionId\":\""+OTHER+"\"","\"transactionId\":null"),
                singletonPayload("processing").replace("\"createBody\":null","\"createBody\":"+captureBody().replace("2026-10-11T00:00:00Z","2026-02-30T00:00:00Z")),
                singletonPayload("processing").replace("\"createBody\":null","\"createBody\":"+captureBody().replace("2026-10-11T00:00:00Z","2026-10-11T24:00:00Z")),
                singletonPayload("processing").replace("\"createBody\":null","\"createBody\":"+captureBody().replace("audio/m4a","audio/private-unknown"))})
            reject("singleton",new Class<?>[]{String.class,String.class,long.class,String.class},"singleton",ID,2L,invalid);
        reject("singleton",new Class<?>[]{String.class,String.class,long.class,String.class},"other",ID,2L,singletonPayload("terminal"));
        reject("singleton",new Class<?>[]{String.class,String.class,long.class,String.class},"singleton",OTHER,2L,singletonPayload("terminal"));
        for (String field : new String[]{"id","revision","phase","audioReference","locale","durationMs","recordedAt","timezoneOffsetMinutes","createBody","sessionId","version","processBody"})
            reject("batch",new Class<?>[]{String.class,long.class,String.class},ID,2L,removeFlatField(batchPayload("completed"),field));
        for (String field : new String[]{"attemptId","revision","phase","createKey","processKey","cancelKey","createBody","sessionId","sessionVersion","processBody","proposalId","proposalVersion","confirmationKey","confirmationBody","transactionId","audioReference","createdAt"})
            reject("singleton",new Class<?>[]{String.class,String.class,long.class,String.class},"singleton",ID,2L,removeFlatField(singletonPayload("saved"),field));
        String optional = batchPayload("failed").replace("\"id\":","\"failureCode\":\"voice_canary_restricted\",\"retryAfterAt\":0,\"id\":");
        checked(!flag(batch(optional),"blocksLaunch"), "known optional terminal evidence accepted");
        for (String invalid : new String[]{optional.replace("voice_canary_restricted","private_unknown_failure"),
                optional.replace("\"retryAfterAt\":0","\"retryAfterAt\":-1"),
                batchPayload("completed").replace("\"audioReference\":null","\"audioReference\":\""+"x".repeat(2049)+"\""),
                batchPayload("completed").replace("\"createBody\":null","\"createBody\":{\"secret\":\""+"x".repeat(8192)+"\"}")})
            reject("batch",new Class<?>[]{String.class,long.class,String.class},ID,2L,invalid);
        String oldOffset = legacy.replace("\"timezoneOffsetMinutes\":0","\"timezoneOffsetMinutes\":841");
        checked(flag(invoke("legacy",new Class<?>[]{String.class,String.class},"masarifi.voice.pending."+"a".repeat(24),oldOffset),"blocksLaunch"),
                "preserved legacy integer offset is not silently rejected as newer capture format");
        String maxUuid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
        reject("batch",new Class<?>[]{String.class,long.class,String.class},maxUuid,2L,batchPayload("completed").replace(ID,maxUuid));
        String nilUuid = "00000000-0000-0000-0000-000000000000";
        checked(!flag(invoke("batch",new Class<?>[]{String.class,long.class,String.class},nilUuid,2L,batchPayload("completed").replace(ID,nilUuid)),"blocksLaunch"),
                "pinned UUID parser permits nil UUID");
        row = singleton(singletonPayload("processing").replace("\"createBody\":null","\"createBody\":"+captureBody().replace("2026-10-11T00:00:00Z","2026-10-11T00:00Z")));
        checked(flag(row,"blocksLaunch"), "pinned datetime accepts minute precision");
        System.out.println("PASS: "+checks+" synthetic journal classification checks; no store/device/provider accessed");
    }
    private static String batchPayload(String phase) {
        return "{\"id\":\""+ID+"\",\"revision\":2,\"phase\":\""+phase+"\",\"audioReference\":null,\"locale\":\"ar\",\"durationMs\":1000,\"recordedAt\":0,\"timezoneOffsetMinutes\":0,\"createBody\":null,\"sessionId\":null,\"version\":null,\"processBody\":null}";
    }
    private static String singletonPayload(String phase) {
        return "{\"attemptId\":\""+ID+"\",\"revision\":2,\"phase\":\""+phase+"\",\"createKey\":\""+ID+"\",\"processKey\":\""+ID+"\",\"cancelKey\":\""+ID+"\",\"createBody\":null,\"sessionId\":null,\"sessionVersion\":null,\"processBody\":null,\"proposalId\":null,\"proposalVersion\":null,\"confirmationKey\":null,\"confirmationBody\":null,\"transactionId\":"+(phase.equals("saved") ? "\""+OTHER+"\"" : "null")+",\"audioReference\":null,\"createdAt\":0}";
    }
    private static String captureBody() {
        return "{\"locale\":\"ar\",\"durationMs\":1000,\"contentType\":\"audio/m4a\",\"sizeBytes\":32,\"contentHash\":\""+"a".repeat(64)+"\",\"recordedAt\":\"2026-10-11T00:00:00Z\",\"timezoneOffsetMinutes\":0}";
    }
    private static String removeFlatField(String payload,String field) {
        Matcher match = Pattern.compile("\""+Pattern.quote(field)+"\":(?:\"[^\"]*\"|null|[0-9]+)").matcher(payload);
        if (!match.find()) throw new AssertionError("fixture field missing");
        int first = match.start(), last = match.end();
        if (payload.charAt(last) == ',') last++;
        else if (payload.charAt(first-1) == ',') first--;
        String reduced = payload.substring(0,first)+payload.substring(last);
        StrictJson.parse(reduced); // Keep missing-field cases valid JSON rather than syntax failures.
        return reduced;
    }
    private static Object batch(String payload) throws Exception { return invoke("batch",new Class<?>[]{String.class,long.class,String.class},ID,2L,payload); }
    private static Object singleton(String payload) throws Exception { return invoke("singleton",new Class<?>[]{String.class,String.class,long.class,String.class},"singleton",ID,2L,payload); }
    private static Object invoke(String name,Class<?>[] types,Object...args) throws Exception {
        try { return classifier.getDeclaredMethod(name,types).invoke(null,args); }
        catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) throw runtime;
            throw failure;
        }
    }
    private static boolean flag(Object row,String name) throws Exception { return (boolean) row.getClass().getDeclaredMethod(name).invoke(row); }
    private static void checked(boolean condition,String label) { if (!condition) throw new AssertionError(label);checks++; }
    private static void reject(String name,Class<?>[] types,Object...args) throws Exception {
        try { invoke(name,types,args); }
        catch (IllegalStateException expected) {
            checked(expected.getMessage().matches("JOURNAL_[A-Z_]+") && expected.getCause() == null, "unknown/corrupt row is sanitized indeterminate");return;
        }
        throw new AssertionError("invalid journal row accepted");
    }
}
