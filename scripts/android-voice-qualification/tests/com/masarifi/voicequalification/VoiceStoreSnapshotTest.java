package com.masarifi.voicequalification;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/** Portable preparation tests; never read a real application data directory. */
public final class VoiceStoreSnapshotTest {
    private static int checks;

    public static void main(String[] args) throws Exception {
        Path fixture = Files.createTempDirectory("voice-store-synthetic-");
        VoiceStoreSnapshot snapshot = capture(fixture);
        check(number(summary(snapshot), "files") == 0, "empty existing root");
        check(verify(snapshot), "empty root unchanged");
        close(snapshot);

        String owner = "a".repeat(24);
        put(fixture, "files/SQLite/masarifi-" + owner + ".db", "encrypted fixture");
        put(fixture, "files/SQLite/masarifi-" + owner + ".db-wal", "committed WAL fixture");
        put(fixture, "files/SQLite/masarifi-" + owner + ".db-shm", "shared memory fixture");
        put(fixture, "files/SQLite/masarifi.db", "legacy fixture");
        put(fixture, "databases/RKStorage", "private legacy pending fixture");
        put(fixture, "databases/RKStorage-wal", "legacy WAL fixture");
        put(fixture, "shared_prefs/SecureStore.xml", "synthetic-key-never-export");
        put(fixture, "shared_prefs/unrelated.xml", "do not inspect");
        snapshot = capture(fixture);
        Map<?, ?> result = summary(snapshot);
        check(number(result, "files") == 7, "all recognized stores and sidecars");
        check(number(result, "ownerDatabases") == 1, "owner databases");
        check(number(result, "legacyDatabases") == 1, "legacy database");
        check(number(result, "asyncStorageDatabases") == 1, "legacy AsyncStorage");
        check(number(result, "secureStoreFiles") == 1, "existing preferences");
        check(result.get("fingerprint").toString().matches("[a-f0-9]{64}"), "stable fingerprint");
        check(!result.toString().contains(owner), "owner identity absent from output");
        check(!result.toString().contains("synthetic-key"), "key material absent from output");
        check(!result.containsKey("noReplay"), "inventory alone cannot claim no replay");
        check(verify(snapshot), "original bytes unchanged by capture");
        put(fixture, "files/SQLite/masarifi-" + owner + ".db-wal", "changed WAL fixture");
        check(!verify(snapshot), "WAL byte drift rejected");
        byte[] keyFixture = snapshot.content("shared_prefs/SecureStore.xml");
        close(snapshot);
        for (byte octet : keyFixture) if (octet != 0) throw new AssertionError("sensitive snapshot bytes not cleared");
        checks++;
        VoiceStoreSnapshot closedSnapshot = snapshot;
        expectFailure(() -> summary(closedSnapshot), "CLOSED");

        snapshot = capture(fixture);
        put(fixture, "files/SQLite/masarifi-" + "b".repeat(24) + ".db", "another owner");
        check(!verify(snapshot), "new owner inventory drift rejected");
        close(snapshot);
        snapshot = capture(fixture);
        check(number(summary(snapshot), "ownerDatabases") == 2, "all owners included");
        close(snapshot);
        put(fixture, "files/SQLite/masarifi-broken.db", "unknown owner format");
        expectFailure(() -> capture(fixture), "UNKNOWN_STORE");

        Path orphan = Files.createTempDirectory("voice-store-orphan-");
        put(orphan, "files/SQLite/masarifi-" + owner + ".db-wal", "orphan WAL");
        expectFailure(() -> capture(orphan), "ORPHAN_SIDECAR");
        Path interrupted = Files.createTempDirectory("voice-store-interrupted-");
        put(interrupted, "shared_prefs/SecureStore.xml.bak", "interrupted key write");
        expectFailure(() -> capture(interrupted), "KEY_STORE_BACKUP");
        Path oversized = Files.createTempDirectory("voice-store-oversized-");
        Path db = oversized.resolve("files/SQLite/masarifi.db");
        Files.createDirectories(db.getParent());
        try (var file = new java.io.RandomAccessFile(db.toFile(), "rw")) {
            file.setLength(64L * 1024 * 1024 + 1);
        }
        expectFailure(() -> capture(oversized), "SIZE_LIMIT");
        expectFailure(() -> capture(oversized.resolve("missing")), "ROOT_INVALID");

        Path totalLimit = Files.createTempDirectory("voice-store-total-limit-");
        for (String name : new String[]{"masarifi.db", "masarifi-" + owner + ".db"}) {
            Path sized = totalLimit.resolve("files/SQLite/" + name);
            Files.createDirectories(sized.getParent());
            try (var file = new java.io.RandomAccessFile(sized.toFile(), "rw")) {
                file.setLength(33L * 1024 * 1024);
            }
        }
        expectFailure(() -> capture(totalLimit), "SIZE_LIMIT");
        Path tooMany = Files.createTempDirectory("voice-store-file-limit-");
        for (int index = 0; index < 513; index++)
            put(tooMany, "files/SQLite/masarifi-" + String.format("%024x", index) + ".db", "bounded");
        expectFailure(() -> capture(tooMany), "FILE_LIMIT");

        Path replaced = Files.createTempDirectory("voice-store-replaced-");
        VoiceStoreSnapshot originalRoot = capture(replaced);
        Files.move(replaced, replaced.resolveSibling(replaced.getFileName() + "-preserved"));
        Files.createDirectory(replaced);
        check(!verify(originalRoot), "empty root replacement rejected");
        close(originalRoot);

        Path replacement = Files.createTempDirectory("voice-store-replaced-file-");
        put(replacement, "files/SQLite/masarifi.db", "same bytes");
        Path replacedFile = replacement.resolve("files/SQLite/masarifi.db");
        var originalTimestamp = Files.getLastModifiedTime(replacedFile);
        VoiceStoreSnapshot originalFile = capture(replacement);
        Files.move(replacedFile, replacedFile.resolveSibling("preserved-original.db"));
        put(replacement, "files/SQLite/masarifi.db", "same bytes");
        Files.setLastModifiedTime(replacedFile, originalTimestamp);
        if (Boolean.TRUE.equals(summary(originalFile).get("nativeFileIdentityAvailable"))) {
            check(!verify(originalFile), "same-byte and same-mtime file replacement rejected");
        } else {
            check(Boolean.FALSE.equals(summary(originalFile).get("nativeFileIdentityAvailable")),
                    "unavailable native identity must be explicit");
            System.out.println("UNEXECUTED_PLATFORM_CASE: native file identity comparison unavailable");
        }
        close(originalFile);
        VoiceStoreSnapshot beforeByteChange = capture(replacement);
        put(replacement, "files/SQLite/masarifi.db", "new! bytes");
        Files.setLastModifiedTime(replacedFile, originalTimestamp);
        check(!verify(beforeByteChange), "same-size and same-mtime byte change rejected");
        close(beforeByteChange);

        Path linked = Files.createTempDirectory("voice-store-symlink-");
        Path destination = linked.resolve("files/SQLite/masarifi.db");
        Files.createDirectories(destination.getParent());
        try {
            Files.createSymbolicLink(destination, db);
            expectFailure(() -> capture(linked), "SYMLINK");
            Path linkedParent = Files.createTempDirectory("voice-store-parent-symlink-");
            Files.createSymbolicLink(linkedParent.resolve("files"), oversized.resolve("files"));
            expectFailure(() -> capture(linkedParent), "SYMLINK");
        } catch (UnsupportedOperationException | java.nio.file.FileSystemException unsupported) {
            System.out.println("UNEXECUTED_PLATFORM_CASE: symbolic link creation unavailable");
        }
        unreadableAncestorIsNotAbsence();
        admissionPreferences();
        System.out.println("PASS: " + checks + " synthetic snapshot checks; fixtures retained at " + fixture);
    }

    private static void admissionPreferences() throws Exception {
        String name = "shared_prefs/masarifi_tracking_owner_v2.xml";
        Path root = Files.createTempDirectory("voice-admission-synthetic-");
        put(root, "shared_prefs/SecureStore.xml", "voice-key-fixture");
        Map<String, Object> baseline;
        try (VoiceStoreSnapshot ordinary = capture(root)) {
            baseline = ordinary.summary();
            check(!admissionCaptured(ordinary), "ordinary absence cannot certify tracking absence");
        }
        try (VoiceStoreSnapshot absent = admission(root)) {
            check(admissionCaptured(absent), "opt-in absence bound to tracking inventory");
            check(absent.content(name) == null && !absent.names().contains(name), "tracking absence retained");
            check(absent.verifyUnchanged(), "tracking absence stable");
            put(root, name, "tracking-owner-A");
            check(!absent.verifyUnchanged(), "tracking creation after absence rejected");
        }
        byte[] retained;
        try (VoiceStoreSnapshot extra = admission(root); VoiceStoreSnapshot ordinary = capture(root)) {
            check(extra.names().contains(name), "tracking file exposed to private wrapper");
            retained = extra.content(name);
            check(new String(retained, java.nio.charset.StandardCharsets.UTF_8).equals("tracking-owner-A"), "tracking bytes privately retained");
            check(extra.summary().equals(baseline), "tracking excluded from all public Voice facts");
            check(ordinary.summary().equals(baseline) && !ordinary.names().contains(name), "ordinary capture unchanged");
            check(extra.verifyUnchanged(), "tracking content stable");
            var timestamp = Files.getLastModifiedTime(root.resolve(name));
            put(root, name, "tracking-owner-B");
            Files.setLastModifiedTime(root.resolve(name), timestamp);
            check(!extra.verifyUnchanged(), "same size same timestamp tracking drift rejected");
            check(ordinary.verifyUnchanged(), "ordinary integrity excludes tracking bytes");
        }
        for (byte value : retained) check(value == 0, "tracking bytes wiped on close");
        try (VoiceStoreSnapshot extra = admission(root)) {
            check(extra.summary().equals(baseline), "different tracking bytes preserve Voice fingerprint");
            Files.delete(root.resolve(name));
            check(!extra.verifyUnchanged(), "tracking deletion rejected");
        }
        try (VoiceStoreSnapshot absent = admission(root)) {
            put(root, name + ".bak", "interrupted tracking write");
            check(!absent.verifyUnchanged(), "tracking backup creation rejected");
        }
        expectFailure(() -> admission(root), "KEY_STORE_BACKUP");
        try (VoiceStoreSnapshot ordinary = capture(root)) { check(ordinary.verifyUnchanged(), "ordinary capture ignores tracking backup"); }
        Files.delete(root.resolve(name + ".bak"));
        Path prefs = root.resolve(name);
        try (var file = new java.io.RandomAccessFile(prefs.toFile(), "rw")) { file.setLength(64L * 1024 * 1024 + 1); }
        expectFailure(() -> admission(root), "SIZE_LIMIT");
        Files.delete(prefs);
        try {
            Files.createSymbolicLink(prefs, root.resolve("shared_prefs/SecureStore.xml"));
            expectFailure(() -> admission(root), "SYMLINK");
        } catch (UnsupportedOperationException | java.nio.file.FileSystemException unsupported) {
            System.out.println("UNEXECUTED_PLATFORM_CASE: tracking symbolic link creation unavailable");
        }
    }

    private static VoiceStoreSnapshot admission(Path root) throws Exception {
        return VoiceStoreSnapshot.captureForAdmission(root);
    }

    private static boolean admissionCaptured(VoiceStoreSnapshot snapshot) throws Exception {
        return snapshot.trackingAdmissionCaptured();
    }

    @SuppressWarnings("removal")
    private static void unreadableAncestorIsNotAbsence() throws Exception {
        Path fixture = Files.createTempDirectory("voice-store-unreadable-");
        put(fixture, "files/SQLite/masarifi.db", "must not be omitted");
        try {
            Files.setPosixFilePermissions(fixture.resolve("files"), java.util.Set.of());
            expectFailure(() -> capture(fixture), "STORE_UNREADABLE");
        } catch (UnsupportedOperationException unavailable) {
            System.out.println("UNEXECUTED_PLATFORM_CASE: POSIX ancestor access denial unavailable");
        } finally {
            try { Files.setPosixFilePermissions(fixture.resolve("files"), java.nio.file.attribute.PosixFilePermissions.fromString("rwx------")); }
            catch (UnsupportedOperationException unavailable) { /* Host lacks POSIX attributes. */ }
        }
        // Desktop-only boundary denial checks sanitization on Windows as well.
        SecurityManager previous = System.getSecurityManager();
        System.setSecurityManager(new SecurityManager() {
            @Override public void checkPermission(java.security.Permission permission) { }
            @Override public void checkRead(String file) {
                if (file.startsWith(fixture.resolve("files/SQLite").toString()))
                    throw new SecurityException("synthetic-private-path-must-not-escape");
            }
        });
        try { expectFailure(() -> capture(fixture), "STORE_UNREADABLE"); }
        finally { System.setSecurityManager(previous); }
    }

    private static VoiceStoreSnapshot capture(Path root) { return VoiceStoreSnapshot.capture(root); }
    private static Map<?, ?> summary(VoiceStoreSnapshot snapshot) { return snapshot.summary(); }
    private static boolean verify(VoiceStoreSnapshot snapshot) { return snapshot.verifyUnchanged(); }
    private static void close(VoiceStoreSnapshot snapshot) { snapshot.close(); }

    private static long number(Map<?, ?> values, String key) { return ((Number) values.get(key)).longValue(); }
    private static void put(Path root, String name, String value) throws Exception {
        Path file = root.resolve(name);
        Files.createDirectories(file.getParent());
        Files.writeString(file, value);
    }
    private static void check(boolean value, String reason) {
        if (!value) throw new AssertionError(reason);
        checks++;
    }
    private interface Attempt { void run() throws Exception; }
    private static void expectFailure(Attempt action, String code) throws Exception {
        try { action.run(); } catch (IllegalStateException expected) {
            check(expected.getMessage().equals(code), "sanitized failure " + code);
            return;
        }
        throw new AssertionError("Expected " + code);
    }
}
