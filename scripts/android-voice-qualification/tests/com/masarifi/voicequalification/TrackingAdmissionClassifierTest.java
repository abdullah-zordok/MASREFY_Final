package com.masarifi.voicequalification;

import java.nio.charset.StandardCharsets;

/** Synthetic inputs only; assertions remain enabled without -ea. */
public final class TrackingAdmissionClassifierTest {
    private static int checks;
    private static void source(String input, String expected) {
        check(TrackingAdmissionClassifier.sourceState(input), expected);
    }
    private static void nativeXml(String input, String expected) {
        check(TrackingAdmissionClassifier.nativeState(input == null ? null : input.getBytes(StandardCharsets.UTF_8)), expected);
    }
    private static void check(String actual, String expected) {
        checks++;
        if (!expected.equals(actual)) throw new AssertionError("classification mismatch at " + checks);
    }
    public static void main(String[] args) {
        source(null, "INACTIVE");
        source("{}", "INACTIVE");
        source("{\"smsEnabled\":false,\"notificationEnabled\":false}", "INACTIVE");
        source("{\"smsEnabled\":true}", "ACTIVE");
        source("{\"notificationEnabled\":true}", "ACTIVE");
        source(" ".repeat(24574) + "{}", "INACTIVE");
        for (String invalid : new String[]{"", "null", "[]", "true", "0", "{", "{}x",
                "{\"smsEnabled\":\"true\"}", "{\"smsEnabled\":null}",
                "{\"smsEnabled\":true,\"notificationEnabled\":1}",
                "{\"smsEnabled\":false,\"smsEnabled\":true}", "{\"smsEnabled\":false,\"\\u0073msEnabled\":true}", "{\"unexpected\":false}",
                " ".repeat(24577)}) source(invalid, "UNKNOWN");
        nativeXml(null, "INACTIVE");
        nativeXml("<map/>", "INACTIVE");
        nativeXml("<?xml version='1.0' encoding='utf-8' standalone='yes'?><map><string name='context'>{}</string></map>", "INACTIVE");
        nativeXml("<map><string name='context'>{\"sms\":true}</string></map>", "ACTIVE");
        nativeXml("<map><string name='context'>{\"notification\":true,\"owner\":\"private\"}</string></map>", "ACTIVE");
        nativeXml("<map><boolean name='suspended' value='false'/><string name='context'>{\"sms\":false,\"notification\":false}</string></map>", "INACTIVE");
        nativeXml("<map><boolean name='suspended' value='true'/><string name='context'>malformed retained context</string></map>", "INACTIVE");
        nativeXml("<map><string name='context'>{\"sms\":true}</string><boolean name='suspended' value='true'/></map>", "INACTIVE");
        nativeXml("<map><string name='context'>{\"sms\":false,\"owner\":\"a&amp;b\"}</string></map>", "INACTIVE");
        nativeXml("<map/>" + " ".repeat(65530), "INACTIVE");
        nativeXml("<map><string name='context'>" + " ".repeat(24574) + "{}</string></map>", "INACTIVE");
        for (String invalid : new String[]{"", "<map>", "<map/>tail", "<map/><map/>",
                "<!DOCTYPE map [<!ENTITY x 'true'>]><map/>", "<!--x--><map/>",
                "<map><string name='context'><![CDATA[{}]]></string></map>",
                "<?unknown x?><map/>", "<x:map xmlns:x='urn:x'/>", "<map xmlns='urn:x'/>",
                "<map unexpected='1'/>", "<map><int name='suspended' value='1'/></map>",
                "<map><boolean name='suspended' value='TRUE'/></map>",
                "<map><boolean name='suspended' value='true' value='false'/></map>",
                "<map><boolean name='suspended' value='true'/><string name='context'>" + "x".repeat(24577) + "</string></map>",
                "<map><string name='context'>{\"owner\":" + "[".repeat(25) + "0" + "]".repeat(25) + "}</string></map>",
                "<map><boolean name='suspended' value='true'>x</boolean></map>",
                "<map><boolean name='suspended' value='true'/><boolean name='suspended' value='false'/></map>",
                "<map><boolean name='suspended' value='true'/><string name='context'>{}</string><string name='context'>{}</string></map>",
                "<map><boolean name='suspended' value='true'/><string name='unknown'>x</string></map>",
                "<map><string name='context'><string name='context'>{}</string></string></map>",
                "<map><string name='context' extra='x'>{}</string></map>",
                "<map><string name='context'>{\"sms\":\"true\"}</string></map>",
                "<map><string name='context'>{\"sms\":false,\"sms\":true}</string></map>",
                "<map><string name='context'>null</string></map>",
                "<map><string name='context'>[]</string></map>",
                "<map><string name='context'>&unknown;</string></map>",
                "<map>unexpected</map>", " ".repeat(65537)}) nativeXml(invalid, "UNKNOWN");
        check(TrackingAdmissionClassifier.nativeState(new byte[]{(byte)0xc3, (byte)0x28}), "UNKNOWN");
        System.out.println("TrackingAdmissionClassifierTest: " + checks + " checks PASS");
    }
}
