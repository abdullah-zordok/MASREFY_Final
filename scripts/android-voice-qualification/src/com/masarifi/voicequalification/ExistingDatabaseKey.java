package com.masarifi.voicequalification;

import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Existing-only AES-GCM primitive. Envelope mapping/classification is separate. */
public final class ExistingDatabaseKey implements AutoCloseable {
    public record Envelope(String scheme, String keychainService, boolean requireAuthentication,
                           boolean usesKeystoreSuffix, int tagBits, String iv, String ciphertext) {}
    @FunctionalInterface public interface ExistingKeySource {
        SecretKey existing(String alias) throws GeneralSecurityException;
    }
    private final byte[] key;
    private boolean closed;
    private ExistingDatabaseKey(byte[] key) { this.key = key; }

    public static ExistingDatabaseKey decrypt(Envelope envelope, ExistingKeySource source) {
        if (envelope == null) throw failure("KEY_ENVELOPE");
        if (envelope.requireAuthentication()) throw failure("KEY_AUTHENTICATION_REQUIRED");
        if (!"aes".equals(envelope.scheme()) || !"key_v1".equals(envelope.keychainService()) ||
                envelope.tagBits() < 96 || envelope.tagBits() > 128 || envelope.tagBits() % 8 != 0 ||
                envelope.iv() == null || envelope.ciphertext() == null ||
                envelope.iv().length() > 32 || envelope.ciphertext().length() > 128) throw failure("KEY_ENVELOPE");
        byte[] iv = null, ciphertext = null, plaintext = null, decoded = null;
        boolean transferred = false;
        try {
            try {
                iv = Base64.getDecoder().decode(envelope.iv());
                ciphertext = Base64.getDecoder().decode(envelope.ciphertext());
            } catch (IllegalArgumentException invalid) { throw failure("KEY_ENVELOPE"); }
            if (iv.length != 12 || ciphertext.length < envelope.tagBits() / 8 || ciphertext.length > 96)
                throw failure("KEY_ENVELOPE");
            if (source == null) throw failure("KEY_UNAVAILABLE");
            SecretKey existing;
            try {
                existing = source.existing("AES/GCM/NoPadding:key_v1" +
                        (envelope.usesKeystoreSuffix() ? ":keystoreUnauthenticated" : ""));
            } catch (GeneralSecurityException | RuntimeException unavailable) { throw failure("KEY_UNAVAILABLE"); }
            if (existing == null) throw failure("KEY_UNAVAILABLE");
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, existing, new GCMParameterSpec(envelope.tagBits(), iv));
                plaintext = cipher.doFinal(ciphertext);
            } catch (GeneralSecurityException | RuntimeException unavailable) { throw failure("KEY_DECRYPTION"); }
            if (plaintext.length != 64) throw failure("KEY_FORMAT");
            decoded = new byte[32];
            for (int index = 0; index < decoded.length; index++) {
                int high = hex(plaintext[index * 2]), low = hex(plaintext[index * 2 + 1]);
                if (high < 0 || low < 0) throw failure("KEY_FORMAT");
                decoded[index] = (byte) (high * 16 + low);
            }
            ExistingDatabaseKey result = new ExistingDatabaseKey(decoded);
            transferred = true;
            return result;
        } finally {
            wipe(iv); wipe(ciphertext); wipe(plaintext);
            if (!transferred) wipe(decoded);
        }
    }

    /** Call only in a separately approved target-UID Android process. Never creates an alias. */
    public static ExistingKeySource androidExistingOnly() {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            return alias -> {
                if (!alias.equals("AES/GCM/NoPadding:key_v1") &&
                        !alias.equals("AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"))
                    throw new GeneralSecurityException("KEY_ALIAS_INVALID");
                KeyStore.Entry entry = store.getEntry(alias, null);
                return entry instanceof KeyStore.SecretKeyEntry secret ? secret.getSecretKey() : null;
            };
        } catch (GeneralSecurityException | java.io.IOException | RuntimeException unavailable) {
            throw failure("KEY_UNAVAILABLE");
        }
    }

    byte[] bytes() { if (closed) throw failure("CLOSED"); return key; }
    @Override public void close() { wipe(key); closed = true; }
    private static void wipe(byte[] bytes) { if (bytes != null) Arrays.fill(bytes, (byte) 0); }
    private static int hex(byte value) {
        if (value >= '0' && value <= '9') return value - '0';
        if (value >= 'a' && value <= 'f') return value - 'a' + 10;
        if (value >= 'A' && value <= 'F') return value - 'A' + 10;
        return -1;
    }
    private static IllegalStateException failure(String code) { return new IllegalStateException(code); }
}
