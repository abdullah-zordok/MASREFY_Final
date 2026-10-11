package com.masarifi.voicequalification;

import java.time.LocalDate;
import java.time.DateTimeException;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Pure, bounded interpretation of the pinned 91213b4/7967007 Voice rows.
 * This is not a whole-store schema check, nor permission to launch/replay. */
public final class VoiceJournalClassifier {
    private static final long SAFE_INTEGER = 9007199254740991L;
    private static final Pattern UUID = Pattern.compile(
            "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|"+
            "00000000-0000-0000-0000-000000000000)", Pattern.CASE_INSENSITIVE);
    private static final Pattern HASH = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern LEGACY_KEY = Pattern.compile("masarifi\\.voice\\.pending\\.[0-9a-f]{24}");
    private static final Pattern DATE_TIME = Pattern.compile(
            "[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\\.[0-9]+)?)?Z");
    private static final Set<String> BATCH_TERMINAL = Set.of("completed","cancelled","failed");
    private static final Set<String> SINGLETON_TERMINAL = Set.of("saved","cancelled","terminal");
    private static final Set<String> BATCH_PHASES = Set.of("captured","created","uploaded","processing","cancel_requested","completed","cancelled","failed");
    private static final Set<String> SINGLETON_PHASES = Set.of("captured","creating","created","uploaded","processing","reviewing","confirming","confirmation_unknown","saved","cancel_requested","cancelled","terminal");

    /** Only booleans escape this layer; no row identifier, audio reference or payload. */
    public record Assessment(boolean pending, boolean terminal, boolean audioOwned, boolean confirmationOwned) {
        public boolean blocksLaunch() { return pending || audioOwned || confirmationOwned; }
    }

    static Assessment batch(String rowId, long rowRevision, String payload) {
        Map<?,?> row = object(payload,8192);
        keys(row,Set.of("id","revision","phase","audioReference","locale","durationMs","recordedAt",
                "timezoneOffsetMinutes","createBody","sessionId","version","processBody"),Set.of("failureCode","retryAfterAt"));
        identity(rowId,rowRevision,row.get("id"),row.get("revision"));
        String phase = choice(row.get("phase"),BATCH_PHASES);
        validateBatchFields(row);
        boolean terminal = BATCH_TERMINAL.contains(phase);
        return new Assessment(!terminal,terminal,row.get("audioReference") != null,false);
    }
    private static void validateBatchFields(Map<?,?> row) {
        choice(row.get("locale"),Set.of("ar","en"));
        range(row.get("durationMs"),1,60000);
        range(row.get("recordedAt"),0,SAFE_INTEGER);
        range(row.get("timezoneOffsetMinutes"),-840,840);
        nullableId(row.get("sessionId"));
        nullableNumber(row.get("version"),1,SAFE_INTEGER);
        nullableObject(row.get("createBody"));
        nullableObject(row.get("processBody"));
        if (row.containsKey("failureCode")) choice(row.get("failureCode"),Set.of("voice_canary_restricted"));
        if (row.containsKey("retryAfterAt")) range(row.get("retryAfterAt"),0,SAFE_INTEGER);
        nullableText(row.get("audioReference"),0,2048);
    }

    static Assessment singleton(String rowId, String attemptId, long rowRevision, String payload) {
        if (!"singleton".equals(rowId)) throw failure("JOURNAL_ROW_ID");
        Map<?,?> row = object(payload,24000);
        keys(row,Set.of("attemptId","revision","phase","createKey","processKey","cancelKey","createBody",
                "sessionId","sessionVersion","processBody","proposalId","proposalVersion","confirmationKey",
                "confirmationBody","transactionId","audioReference","createdAt"),Set.of());
        identity(attemptId,rowRevision,row.get("attemptId"),row.get("revision"));
        String phase = choice(row.get("phase"),SINGLETON_PHASES);
        validateSingletonFields(row);
        if (phase.equals("saved") && row.get("transactionId") == null) throw failure("JOURNAL_PHASE_STATE");
        boolean terminal = SINGLETON_TERMINAL.contains(phase);
        boolean confirmation = row.get("confirmationKey") != null || row.get("confirmationBody") != null ||
                phase.equals("confirming") || phase.equals("confirmation_unknown");
        return new Assessment(!terminal,terminal,row.get("audioReference") != null,confirmation);
    }
    private static void validateSingletonFields(Map<?,?> row) {
        for (String name : new String[]{"createKey","processKey","cancelKey"}) identifier(row.get(name));
        for (String name : new String[]{"sessionId","proposalId","confirmationKey","transactionId"}) nullableId(row.get(name));
        nullableNumber(row.get("sessionVersion"),1,SAFE_INTEGER);
        nullableNumber(row.get("proposalVersion"),1,SAFE_INTEGER);
        range(row.get("createdAt"),0,SAFE_INTEGER);
        nullableText(row.get("audioReference"),1,2048);
        nullableObject(row.get("confirmationBody"));
        if (row.get("createBody") != null) captureBody(requireObject(row.get("createBody")));
        if (row.get("processBody") != null) processBody(requireObject(row.get("processBody")));
    }

    static Assessment legacy(String key, String payload) {
        if (key == null || !LEGACY_KEY.matcher(key).matches()) throw failure("JOURNAL_LEGACY_KEY");
        Map<?,?> row = object(payload,24000);
        keys(row,Set.of("sessionId","sessionVersion","recordedAt","timezoneOffsetMinutes","createdAt"),Set.of());
        identifier(row.get("sessionId"));
        range(row.get("sessionVersion"),1,SAFE_INTEGER);
        range(row.get("recordedAt"),0,SAFE_INTEGER);
        // The legacy schema accepts any safe integer offset; do not silently
        // apply the newer capture's +/-840 constraint to preserved old rows.
        range(row.get("timezoneOffsetMinutes"),-SAFE_INTEGER,SAFE_INTEGER);
        range(row.get("createdAt"),0,SAFE_INTEGER);
        return new Assessment(true,false,false,false);
    }

    private static void captureBody(Map<?,?> body) {
        keys(body,Set.of("locale","durationMs","contentType","sizeBytes","contentHash","recordedAt","timezoneOffsetMinutes"),Set.of());
        choice(body.get("locale"),Set.of("ar","en"));
        choice(body.get("contentType"),Set.of("audio/m4a","audio/mp4","audio/mpeg","audio/ogg","audio/wav","audio/webm"));
        range(body.get("durationMs"),1,60000);
        range(body.get("sizeBytes"),1,12582912);
        hash(body.get("contentHash"));
        range(body.get("timezoneOffsetMinutes"),-840,840);
        if (!(body.get("recordedAt") instanceof String date) || !DATE_TIME.matcher(date).matches()) throw failure("JOURNAL_DATE");
        try { LocalDate.parse(date.substring(0,10)); }
        catch (DateTimeException invalid) { throw failure("JOURNAL_DATE"); }
    }
    private static void processBody(Map<?,?> body) {
        keys(body,Set.of("uploadCompleted","expectedVersion","contentHash"),Set.of());
        if (!Boolean.TRUE.equals(body.get("uploadCompleted"))) throw failure("JOURNAL_PROCESS_BODY");
        range(body.get("expectedVersion"),1,SAFE_INTEGER);
        hash(body.get("contentHash"));
    }
    private static void identity(String rowId,long rowRevision,Object id,Object revision) {
        identifier(rowId);
        identifier(id);
        if (!rowId.equals(id) || rowRevision < 0 || rowRevision > SAFE_INTEGER ||
                range(revision,0,SAFE_INTEGER) != rowRevision) throw failure("JOURNAL_ROW_ID");
    }
    private static Map<?,?> object(String payload,int limit) {
        if (payload == null || payload.length() > limit) throw failure("JOURNAL_LIMIT");
        try { return requireObject(StrictJson.parse(payload)); }
        catch (IllegalStateException invalid) { throw failure("JOURNAL_JSON"); }
    }
    private static Map<?,?> requireObject(Object value) {
        if (!(value instanceof Map<?,?> object)) throw failure("JOURNAL_OBJECT");
        return object;
    }
    private static void keys(Map<?,?> object,Set<String> required,Set<String> optional) {
        if (!object.keySet().containsAll(required)) throw failure("JOURNAL_SCHEMA");
        for (Object key : object.keySet()) if (!required.contains(key) && !optional.contains(key)) throw failure("JOURNAL_SCHEMA");
    }
    private static long range(Object value,long minimum,long maximum) {
        long integer;
        try { integer = StrictJson.integer(value); }
        catch (IllegalStateException invalid) { throw failure("JOURNAL_INTEGER"); }
        if (integer < minimum || integer > maximum) throw failure("JOURNAL_INTEGER");
        return integer;
    }
    private static String choice(Object value,Set<String> allowed) {
        if (!(value instanceof String text) || !allowed.contains(text)) throw failure("JOURNAL_ENUM");
        return text;
    }
    private static void identifier(Object value) {
        if (!(value instanceof String text) || !UUID.matcher(text).matches()) throw failure("JOURNAL_IDENTIFIER");
    }
    private static void hash(Object value) {
        if (!(value instanceof String text) || !HASH.matcher(text).matches()) throw failure("JOURNAL_HASH");
    }
    private static void nullableId(Object value) { if (value != null) identifier(value); }
    private static void nullableNumber(Object value,long minimum,long maximum) { if (value != null) range(value,minimum,maximum); }
    private static void nullableObject(Object value) { if (value != null) requireObject(value); }
    private static void nullableText(Object value,int minimum,int maximum) {
        if (value != null && (!(value instanceof String text) || text.length() < minimum || text.length() > maximum))
            throw failure("JOURNAL_TEXT");
    }
    private static IllegalStateException failure(String code) { return new IllegalStateException(code); }
}
