package com.masarifi.voicequalification;

import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Real AES-GCM on public disposable keys, never AndroidKeyStore or app data. */
public final class ExistingDatabaseKeyTest {
    private static int checks;

    public static void main(String[] args) throws Exception {
        var key = new SecretKeySpec(new byte[32], "AES");
        String hexadecimal = "12".repeat(32);
        var envelope = envelope(key, hexadecimal, false);
        int[] reads = {0};
        try (var material = ExistingDatabaseKey.decrypt(envelope, alias -> {
            check(alias.equals("AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"), "current alias only");
            reads[0]++;
            return key;
        })) {
            check(material.bytes().length == 32 && material.bytes()[0] == 0x12, "real AES-GCM hex key decoded");
            byte[] returned = material.bytes();
            material.close();
            check(allZero(returned), "decoded key cleared on close");
            expectFailure(material::bytes, "CLOSED");
        }
        check(reads[0] == 1, "one existing-only lookup");
        var legacy = envelope(key, hexadecimal, true);
        try (var material = ExistingDatabaseKey.decrypt(legacy, alias -> {
            check(alias.equals("AES/GCM/NoPadding:key_v1"), "legacy alias only"); return key;
        })) {
            check(material.bytes().length == 32, "legacy envelope decoded without fallback creation");
        }
        expectFailure(() -> ExistingDatabaseKey.decrypt(envelope, alias -> null), "KEY_UNAVAILABLE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(envelope, alias -> {
            throw new java.security.GeneralSecurityException("PRIVATE KEY DATABASE OWNER SECRET");
        }), "KEY_UNAVAILABLE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(envelope, alias -> new SecretKeySpec(new byte[16], "AES")), "KEY_DECRYPTION");
        expectFailure(() -> ExistingDatabaseKey.decrypt(envelope(key, "x".repeat(64), false), alias -> key), "KEY_FORMAT");
        expectFailure(() -> ExistingDatabaseKey.decrypt(envelope(key, "1".repeat(63), false), alias -> key), "KEY_FORMAT");
        int[] disallowedReads = {0};
        ExistingDatabaseKey.ExistingKeySource never = alias -> { disallowedReads[0]++; return key; };
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("hybrid", "key_v1", false, true, 128, envelope.iv(), envelope.ciphertext()), never), "KEY_ENVELOPE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("aes", "foreign", false, true, 128, envelope.iv(), envelope.ciphertext()), never), "KEY_ENVELOPE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("aes", "key_v1", true, true, 128, envelope.iv(), envelope.ciphertext()), never), "KEY_AUTHENTICATION_REQUIRED");
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("aes", "key_v1", false, true, 64, envelope.iv(), envelope.ciphertext()), never), "KEY_ENVELOPE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("aes", "key_v1", false, true, 128, "not base64", envelope.ciphertext()), never), "KEY_ENVELOPE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("aes", "key_v1", false, true, 128, Base64.getEncoder().encodeToString(new byte[11]), envelope.ciphertext()), never), "KEY_ENVELOPE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(new ExistingDatabaseKey.Envelope("aes", "key_v1", false, true, 128, envelope.iv(), "A".repeat(256)), never), "KEY_ENVELOPE");
        check(disallowedReads[0] == 0, "invalid/authenticated envelopes rejected before keystore access");
        expectFailure(() -> ExistingDatabaseKey.decrypt(null, never), "KEY_ENVELOPE");
        expectFailure(() -> ExistingDatabaseKey.decrypt(envelope, null), "KEY_UNAVAILABLE");
        System.out.println("PASS: " + checks + " existing-only synthetic AES-GCM key checks");
    }

    private static ExistingDatabaseKey.Envelope envelope(SecretKeySpec key, String text, boolean legacy) throws Exception {
        byte[] iv = new byte[12]; iv[0] = 1;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(text.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        return new ExistingDatabaseKey.Envelope("aes", "key_v1", false, !legacy, 128,
                Base64.getEncoder().encodeToString(iv), Base64.getEncoder().encodeToString(encrypted));
    }
    private interface Action { Object run() throws Exception; }
    private static void expectFailure(Action action, String code) throws Exception {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (IllegalStateException expected) {
            check(code.equals(expected.getMessage()) && expected.getCause() == null, "sanitized failure " + code);
        }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
    private static boolean allZero(byte[] bytes) { for (byte value : bytes) if (value != 0) return false; return true; }
}
