package com.masarifi.voicequalification;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;

/** Synthetic preference mapping only; never invokes AndroidKeyStore. */
public final class SecureStoreKeyIndexTest {
    private static final String OWNER = "a".repeat(64);
    private static final String ENVELOPE = "{\"scheme\":\"aes\",\"ct\":\"QUJD\",\"iv\":\"QUJD\",\"tlen\":128,\"keystoreAlias\":\"key_v1\",\"usesKeystoreSuffix\":true,\"requireAuthentication\":false}";
    private static int checks;
    public static void main(String[] args) throws Exception {
        SecureStoreKeyIndex index = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE) + entry("unrelated", "not JSON")));
        var envelope = owner(index, "a".repeat(24));
        check(envelope.scheme().equals("aes") && envelope.usesKeystoreSuffix(), "current owner hash mapped");
        SecureStoreKeyIndex legacy = parse(map(entry("masarifi.database.key." + OWNER, "{\"scheme\":\"aes\",\"ct\":\"QUJD\",\"iv\":\"QUJD\",\"tlen\":128}")));
        check(!owner(legacy, "a".repeat(24)).usesKeystoreSuffix(), "old default-alias envelope mapped without generation");
        SecureStoreKeyIndex multiple = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE) + entry("key_v1-masarifi.database.key." + "b".repeat(64), ENVELOPE)));
        check(owner(multiple, "b".repeat(24)).scheme().equals("aes"), "every owner independently mapped");
        reject(() -> owner(index, "c".repeat(24)), "KEY_MISSING");
        reject(() -> owner(index, "not-owner"), "OWNER_FORMAT");
        SecureStoreKeyIndex duplicateForms = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE) + entry("masarifi.database.key." + OWNER, ENVELOPE)));
        reject(() -> owner(duplicateForms, "a".repeat(24)), "KEY_AMBIGUOUS");
        SecureStoreKeyIndex collision = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE) + entry("key_v1-masarifi.database.key." + "a".repeat(24) + "b".repeat(40), ENVELOPE)));
        reject(() -> owner(collision, "a".repeat(24)), "KEY_AMBIGUOUS");
        reject(() -> parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE).repeat(2))), "XML_DUPLICATE_KEY");
        reject(() -> parse(map(entry("key_v2-masarifi.database.key." + OWNER, ENVELOPE))), "KEY_MAPPING_UNKNOWN");
        reject(() -> parse(map(entry("key_v1-masarifi.database.key.broken", ENVELOPE))), "KEY_MAPPING_UNKNOWN");
        reject(() -> parse("<!DOCTYPE map [<!ENTITY secret SYSTEM 'file:///NEVER_READ'>]><map/>"), "XML_UNSUPPORTED_MARKUP");
        reject(() -> parse("<map><string name='x'>&unknown;</string></map>"), "XML_INVALID");
        reject(() -> parse("<map><string name='key_v1-masarifi.database.key." + OWNER + "'><child/></string></map>"), "XML_SHAPE");
        reject(() -> parse("<map><int name='key_v1-masarifi.database.key." + OWNER + "' value='0'/></map>"), "XML_SHAPE");
        reject(() -> parse("<map xmlns='foreign'/>"), "XML_SHAPE");
        reject(() -> parse("<map/><map/>"), "XML_INVALID");
        reject(() -> parse(map(entry("key_v1-masarifi.database.key." + OWNER, "x".repeat(4097)))), "KEY_ENVELOPE");
        SecureStoreKeyIndex badMetadata = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE.replace("false", "\"false\""))));
        reject(() -> owner(badMetadata, "a".repeat(24)), "KEY_ENVELOPE");
        SecureStoreKeyIndex extra = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE.replace("\"scheme\":", "\"unknown\":1,\"scheme\":"))));
        reject(() -> owner(extra, "a".repeat(24)), "KEY_ENVELOPE");
        SecureStoreKeyIndex duplicateJson = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE.replace("\"scheme\":", "\"scheme\":null,\"scheme\":"))));
        reject(() -> owner(duplicateJson, "a".repeat(24)), "JSON_DUPLICATE_KEY");
        byte[] malformedUtf8 = {(byte)0xc3, (byte)0x28};
        reject(() -> parseBytes(malformedUtf8), "XML_ENCODING");
        reject(() -> parse("<map><!-- unsupported --></map>"), "XML_UNSUPPORTED_MARKUP");
        reject(() -> parse("<map><?unknown value?></map>"), "XML_SHAPE");
        reject(() -> parse("<map><string name='key_v1-masarifi.database.key." + OWNER + "' extra='unknown'/></map>"), "XML_SHAPE");
        reject(() -> parse(map(entry("key_v1-masarifi.database.key." + OWNER.toUpperCase(), ENVELOPE))), "KEY_MAPPING_UNKNOWN");
        reject(() -> parseBytes(new byte[4 * 1024 * 1024 + 1]), "XML_LIMIT");
        StringBuilder manyEntries = new StringBuilder();
        for (int number = 0; number < 513; number++) manyEntries.append(entry("unrelated-" + number, "safe"));
        reject(() -> parse(map(manyEntries.toString())), "XML_LIMIT");
        reject(() -> parse("<map><set name='x'>" + "<string/>".repeat(4096) + "</set></map>"), "XML_LIMIT");
        reject(() -> owner(parse("<map/>"), "a".repeat(24)), "KEY_MISSING");
        SecureStoreKeyIndex unusedCorruptOwner = parse(map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE)
                + entry("key_v1-masarifi.database.key." + "b".repeat(64), "not JSON")));
        check(owner(unusedCorruptOwner, "a".repeat(24)).tagBits() == 128, "unused encrypted envelope is not opened");
        reject(() -> owner(unusedCorruptOwner, "b".repeat(24)), "KEY_ENVELOPE");
        for (String invalidEnvelope : new String[]{"[]", "null", "{}", "{\"tlen\":1e99999999}",
                ENVELOPE.replace("128", "127"), ENVELOPE.replace("128", "128.5"),
                ENVELOPE.replace("\"QUJD\"", "null"), ENVELOPE.replace("true", "null")})
            reject(() -> owner(parse(map(entry("key_v1-masarifi.database.key." + OWNER, invalidEnvelope))), "a".repeat(24)), "KEY_ENVELOPE");
        byte[] original = map(entry("key_v1-masarifi.database.key." + OWNER, ENVELOPE)).getBytes(StandardCharsets.UTF_8);
        byte[] preserved = original.clone();
        owner(parseBytes(original), "a".repeat(24));
        check(Arrays.equals(original, preserved), "input preference bytes unchanged");
        mappedDecryption(false);
        mappedDecryption(true);
        unavailableXmlProvidersFailSanitized();
        System.out.println("PASS: " + checks + " owner-key preference mapping checks");
    }
    private static SecureStoreKeyIndex parse(String xml) { return parseBytes(xml.getBytes(StandardCharsets.UTF_8)); }
    private static SecureStoreKeyIndex parseBytes(byte[] xml) { return SecureStoreKeyIndex.parse(xml); }
    private static ExistingDatabaseKey.Envelope owner(SecureStoreKeyIndex index, String prefix) { return index.owner(prefix); }
    private static void mappedDecryption(boolean current) throws Exception {
        var syntheticKey = new SecretKeySpec(new byte[32], "AES");
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, syntheticKey, new GCMParameterSpec(128, new byte[12]));
        String ciphertext = Base64.getEncoder().encodeToString(cipher.doFinal("11".repeat(32).getBytes(StandardCharsets.US_ASCII)));
        String envelopeJson = "{\"scheme\":\"aes\",\"iv\":\"" + Base64.getEncoder().encodeToString(new byte[12])
                + "\",\"ct\":\"" + ciphertext + "\",\"tlen\":128" + (current ? ",\"usesKeystoreSuffix\":true" : "") + "}";
        var mapped = owner(parse(map(entry((current ? "key_v1-" : "") + "masarifi.database.key." + OWNER, envelopeJson))), "a".repeat(24));
        byte[] clearKey;
        try (var decrypted = ExistingDatabaseKey.decrypt(mapped, alias -> {
            check(alias.equals("AES/GCM/NoPadding:key_v1" + (current ? ":keystoreUnauthenticated" : "")), "mapped existing alias only");
            return syntheticKey;
        })) {
            clearKey = decrypted.bytes();
            byte[] expectedKey = new byte[32];
            Arrays.fill(expectedKey, (byte) 17);
            check(Arrays.equals(clearKey, expectedKey), "mapped synthetic AES-GCM key decrypted");
        }
        check(Arrays.equals(clearKey, new byte[32]), "mapped clear key wiped on close");
    }
    private static void unavailableXmlProvidersFailSanitized() throws Exception {
        String property = "javax.xml.parsers.SAXParserFactory";
        String previous = System.getProperty(property);
        try {
            // Replace only the XML-provider boundary; all mapping/decryption tests use real parsers.
            System.setProperty(property, UnavailableFactory.class.getName());
            reject(() -> parse("<map/>"), "XML_PARSER_UNAVAILABLE");
            System.setProperty(property, "absent.synthetic.XmlFactory");
            reject(() -> parse("<map/>"), "XML_PARSER_UNAVAILABLE");
        } finally {
            if (previous == null) System.clearProperty(property);
            else System.setProperty(property, previous);
        }
    }
    public static final class UnavailableFactory extends SAXParserFactory {
        @Override public SAXParser newSAXParser() {
            throw new IllegalStateException("synthetic provider detail", new RuntimeException("synthetic cause"));
        }
        @Override public void setFeature(String name, boolean enabled) { throw new UnsupportedOperationException(); }
        @Override public boolean getFeature(String name) { throw new UnsupportedOperationException(); }
    }
    private interface Action { Object run() throws Exception; }
    private static void reject(Action action, String code) throws Exception {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (IllegalStateException expected) { check(code.equals(expected.getMessage()) && expected.getCause() == null, "sanitized rejection " + code); }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
    private static String map(String content) { return "<?xml version='1.0' encoding='utf-8' standalone='yes'?><map>" + content + "</map>"; }
    private static String entry(String key, String value) { return "<string name='" + key + "'>" + value.replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;") + "</string>"; }
}
