package com.masarifi.voicequalification;

import java.util.List;
import java.util.Map;

/** Private-data parser contract; no database, provider or real key is used. */
public final class StrictJsonTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        Map<?, ?> value = (Map<?, ?>) parse("{\"phase\":\"processing\",\"revision\":2,\"x\":[null,true,false,{}]}");
        check(value.get("phase").equals("processing") && integer(value.get("revision")) == 2, "journal primitives");
        check(((List<?>) value.get("x")).size() == 4, "arrays and nullable values");
        check(parse("\"قهوة \\uD83D\\uDE00 \\n\\t\\/\\\\\\\"\"").equals("قهوة 😀 \n\t/\\\""), "Unicode and JSON escapes");
        for (String duplicate : new String[]{"{\"phase\":null,\"phase\":\"saved\"}", "{\"phase\":1,\"ph\\u0061se\":2}", "{\"x\":{\"a\":1,\"a\":2}}"})
            reject(duplicate, "JSON_DUPLICATE_KEY");
        for (String malformed : new String[]{"", "{", "[1,]", "{\"a\":1,}", "{a:1}", "{'a':1}", "true false", "01", "-01", ".1", "1.", "1e", "+1", "NaN", "Infinity", "\"bad\nstring\"", "\"\\x41\"", "\"\\uZZZZ\"", "\"\\uD800\"", "\"\\uDC00\"", "\"unfinished"})
            reject(malformed, "JSON_INVALID");
        reject("[".repeat(26) + "0" + "]".repeat(26), "JSON_LIMIT");
        reject("\"" + "x".repeat(24576) + "\"", "JSON_LIMIT");
        reject("[" + "null,".repeat(4096) + "null]", "JSON_LIMIT");
        check(integer(parse("1e2")) == 100 && integer(parse("-1.0")) == -1, "exact integer conversion without float rounding");
        for (String unsupported : new String[]{"1.5", "9223372036854775808", "1e99999999", "1e-99999999"}) {
            try { integer(parse(unsupported)); throw new AssertionError("integer limit required"); }
            catch (IllegalStateException expected) { check(expected.getMessage().equals("JSON_INTEGER"), "bounded exact integer rejection"); }
        }
        System.out.println("PASS: " + checks + " bounded strict JSON checks");
    }
    private static Object parse(String input) { return StrictJson.parse(input); }
    private static long integer(Object input) { return StrictJson.integer(input); }
    private static void reject(String input, String code) throws Exception {
        try { parse(input); throw new AssertionError("expected " + code); }
        catch (IllegalStateException expected) { check(code.equals(expected.getMessage()) && expected.getCause() == null, "sanitized parse rejection"); }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
}
