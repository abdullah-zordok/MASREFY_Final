package com.masarifi.voicequalification;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * Bounded in-memory inventory for an independently quiesced target package.
 * Does not open SQLite, use application loaders, or write any target file.
 * A stable inventory is preparation evidence, never a no-replay verdict.
 */
public final class VoiceStoreSnapshot implements AutoCloseable {
    private static final long LIMIT = 64L * 1024 * 1024;
    private static final int FILE_LIMIT = 512;
    private static final Pattern OWNER_DB = Pattern.compile("masarifi-[a-f0-9]{24}\\.db");
    private static final Pattern STORE = Pattern.compile("(masarifi(?:-[a-f0-9]{24})?\\.db)(-wal|-shm|-journal)?");
    private static final Pattern ASYNC = Pattern.compile("(RKStorage)(-wal|-shm|-journal)?");
    private static final Set<String> KEY_FILES = Set.of("SecureStore.xml", "com.masarifi.mobile_preferences.xml");
    private static final String TRACKING_FILE = "masarifi_tracking_owner_v2.xml";
    private static final String TRACKING_PATH = "shared_prefs/" + TRACKING_FILE;
    private final boolean admission;
    private final String integrityFingerprint;
    private final Path root;
    private final Map<String, String> directories;
    private final Map<String, Stamp> inventory;
    private final Map<String, byte[]> contents;
    private final Map<String, Object> report;
    private boolean closed;

    private VoiceStoreSnapshot(Path root, Map<String, String> directories, Map<String, Stamp> inventory,
                               Map<String, byte[]> contents, boolean admission) {
        this.admission = admission;
        this.root = root;
        this.directories = directories;
        this.inventory = inventory;
        this.contents = contents;
        long bytes = 0;
        int owners = 0, legacy = 0, async = 0, keys = 0, voiceFiles = 0;
        MessageDigest digest = digest();
        MessageDigest integrity = digest();
        for (var entry : contents.entrySet()) {
            String name = entry.getKey();
            byte[] fileDigest = digest().digest(entry.getValue());
            updateEntry(integrity, name, entry.getValue().length, fileDigest);
            // Admission-only bytes must not alter the approved legacy Voice receipt.
            if (name.equals(TRACKING_PATH)) continue;
            bytes += entry.getValue().length;
            voiceFiles++;
            String leaf = Path.of(name).getFileName().toString();
            if (name.startsWith("files/SQLite/") && OWNER_DB.matcher(leaf).matches()) owners++;
            if (name.equals("files/SQLite/masarifi.db")) legacy++;
            if (name.equals("databases/RKStorage")) async++;
            if (name.startsWith("shared_prefs/")) keys++;
            updateEntry(digest, name, entry.getValue().length, fileDigest);
        }
        this.integrityFingerprint = hex(integrity.digest());
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("files", voiceFiles);
        summary.put("totalBytes", bytes);
        summary.put("ownerDatabases", owners);
        summary.put("legacyDatabases", legacy);
        summary.put("asyncStorageDatabases", async);
        summary.put("secureStoreFiles", keys);
        summary.put("nativeFileIdentityAvailable", directories.values().stream().noneMatch(identity -> identity.startsWith("null/"))
                && inventory.values().stream().noneMatch(stamp -> stamp.fileKey.startsWith("null/")));
        summary.put("fingerprint", hex(digest.digest()));
        this.report = Collections.unmodifiableMap(summary);
    }

    public static VoiceStoreSnapshot capture(Path targetRoot) {
        return capture(targetRoot, false);
    }

    /** Captures tracking metadata privately, without extending the legacy Voice report. */
    public static VoiceStoreSnapshot captureForAdmission(Path targetRoot) {
        return capture(targetRoot, true);
    }

    private static VoiceStoreSnapshot capture(Path targetRoot, boolean admission) {
        Map<String, byte[]> bytes = new TreeMap<>();
        boolean transferred = false;
        try {
            if (targetRoot == null) throw failure("ROOT_INVALID");
            Path root = targetRoot.toAbsolutePath().normalize();
            checkDirectory(root, "ROOT_INVALID");
            if (!root.toRealPath().equals(root)) throw failure("SYMLINK");
            Map<String, String> directories = directoryIdentities(root);
            Map<String, Stamp> before = inventory(root, admission);
            long total = 0;
            for (var entry : before.entrySet()) {
                total += entry.getValue().size;
                if (total > LIMIT) throw failure("SIZE_LIMIT");
                Path file = root.resolve(entry.getKey());
                checkParents(root, file.getParent());
                retainFile(bytes, entry.getKey(), file, entry.getValue());
            }
            if (!directories.equals(directoryIdentities(root)) || !before.equals(inventory(root, admission)))
                throw failure("STATE_CHANGED");
            VoiceStoreSnapshot snapshot = new VoiceStoreSnapshot(root, directories, before, bytes, admission);
            transferred = true;
            return snapshot;
        } catch (IOException error) {
            throw failure("STORE_UNREADABLE");
        } catch (SnapshotFailure expected) {
            throw expected;
        } catch (RuntimeException error) {
            throw failure("STORE_UNREADABLE");
        } finally {
            // Includes allocation/provider errors before ownership transfers.
            if (!transferred) wipe(bytes);
        }
    }

    public Map<String, Object> summary() {
        requireOpen();
        return report;
    }

    public boolean verifyUnchanged() {
        requireOpen();
        try {
            if (!directories.equals(directoryIdentities(root)) || !inventory.equals(inventory(root, admission))) return false;
            MessageDigest aggregate = digest();
            for (var entry : inventory.entrySet()) {
                Path file = root.resolve(entry.getKey());
                checkParents(root, file.getParent());
                updateEntry(aggregate, entry.getKey(), entry.getValue().size, fileHash(file, entry.getValue()));
            }
            return directories.equals(directoryIdentities(root)) && inventory.equals(inventory(root, admission)) &&
                    hex(aggregate.digest()).equals(integrityFingerprint);
        } catch (IOException | RuntimeException unreadableOrChanged) {
            return false;
        }
    }

    // Only the independent same-package reader may consume these sensitive bytes.
    boolean trackingAdmissionCaptured() {
        requireOpen();
        return admission;
    }

    byte[] content(String relativeName) {
        requireOpen();
        return contents.get(relativeName);
    }

    Set<String> names() {
        requireOpen();
        return Collections.unmodifiableSet(contents.keySet());
    }

    @Override public void close() {
        if (!closed) {
            wipe(contents);
            closed = true;
        }
    }

    private void requireOpen() { if (closed) throw failure("CLOSED"); }

    private static Map<String, Stamp> inventory(Path root, boolean admission) throws IOException {
        checkDirectory(root, "ROOT_INVALID");
        Map<String, Stamp> result = new TreeMap<>();
        collect(root, "files/SQLite", STORE, result);
        collect(root, "databases", ASYNC, result);
        Path preferences = root.resolve("shared_prefs");
        if (attributesIfPresent(preferences) != null) {
            checkParents(root, preferences);
            try (var children = Files.newDirectoryStream(preferences)) {
                for (Path file : children) {
                    String name = file.getFileName().toString();
                    if (name.endsWith(".bak") && preferenceIncluded(name.substring(0, name.length() - 4), admission))
                        throw failure("KEY_STORE_BACKUP");
                    if (preferenceIncluded(name, admission)) add(root, file, result);
                }
            }
        }
        if (result.size() > FILE_LIMIT) throw failure("FILE_LIMIT");
        for (String name : result.keySet()) {
            for (String suffix : new String[]{"-wal", "-shm", "-journal"}) {
                if (name.endsWith(suffix) && !result.containsKey(name.substring(0, name.length() - suffix.length())))
                    throw failure("ORPHAN_SIDECAR");
            }
        }
        return result;
    }

    private static boolean preferenceIncluded(String name, boolean admission) {
        return KEY_FILES.contains(name) || (admission && name.equals(TRACKING_FILE));
    }

    private static Map<String, String> directoryIdentities(Path root) throws IOException {
        Map<String, String> identities = new TreeMap<>();
        for (String name : new String[]{"", "files", "files/SQLite", "databases", "shared_prefs"}) {
            Path directory = root.resolve(name);
            BasicFileAttributes attributes = attributesIfPresent(directory);
            if (attributes != null) {
                checkDirectory(directory, "STORE_NOT_DIRECTORY");
                // Some desktop NIO providers omit fileKey; retain creation identity
                // as well. Android execution additionally needs native UID/inode
                // and package-quiescence checks in the instrumentation wrapper.
                if (attributes.fileKey() == null && attributes.creationTime().toMillis() == 0)
                    throw failure("FILE_IDENTITY_UNAVAILABLE");
                identities.put(name, String.valueOf(attributes.fileKey()) + "/" + attributes.creationTime());
            }
        }
        return identities;
    }

    private static void collect(Path root, String relative, Pattern pattern,
                                Map<String, Stamp> result) throws IOException {
        Path directory = root.resolve(relative);
        // Inspect existing ancestors even when the final directory is absent.
        checkParents(root, directory.getParent());
        if (attributesIfPresent(directory) == null) return;
        checkDirectory(directory, "STORE_NOT_DIRECTORY");
        try (var children = Files.newDirectoryStream(directory)) {
            for (Path file : children) {
                String name = file.getFileName().toString();
                if (pattern.matcher(name).matches()) add(root, file, result);
                else if (name.startsWith(relative.equals("databases") ? "RKStorage" : "masarifi"))
                    throw failure("UNKNOWN_STORE");
            }
        }
    }

    private static void add(Path root, Path file, Map<String, Stamp> result) throws IOException {
        Stamp stamp = stamp(file);
        if (stamp.size > LIMIT) throw failure("SIZE_LIMIT");
        result.put(root.relativize(file).toString().replace('\\', '/'), stamp);
        if (result.size() > FILE_LIMIT) throw failure("FILE_LIMIT");
    }

    private static byte[] read(Path path, Stamp expected) throws IOException {
        if (!expected.equals(stamp(path))) throw failure("STATE_CHANGED");
        byte[] bytes = new byte[(int) expected.size];
        boolean transferred = false;
        try {
            try (SeekableByteChannel channel = Files.newByteChannel(path,
                    Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) {
                    if (channel.read(buffer) < 0) throw failure("STATE_CHANGED");
                }
                if (channel.read(ByteBuffer.allocate(1)) != -1 || !expected.equals(stamp(path)))
                    throw failure("STATE_CHANGED");
            }
            transferred = true;
            return bytes;
        } finally {
            if (!transferred) Arrays.fill(bytes, (byte) 0);
        }
    }

    private static void retainFile(Map<String, byte[]> contents, String name, Path file, Stamp expected)
            throws IOException {
        byte[] bytes = read(file, expected);
        boolean retained = false;
        try {
            contents.put(name, bytes);
            retained = true;
        } finally {
            if (!retained) Arrays.fill(bytes, (byte) 0);
        }
    }

    private static byte[] fileHash(Path path, Stamp expected) throws IOException {
        if (!expected.equals(stamp(path))) throw failure("STATE_CHANGED");
        byte[] bytes = new byte[64 * 1024];
        MessageDigest hash = digest();
        long read = 0;
        try (SeekableByteChannel channel = Files.newByteChannel(path,
                Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            int count;
            while ((count = channel.read(buffer)) != -1) {
                read += count;
                if (read > expected.size) throw failure("STATE_CHANGED");
                hash.update(bytes, 0, count);
                ((java.nio.Buffer) buffer).clear();
            }
            if (read != expected.size || !expected.equals(stamp(path))) throw failure("STATE_CHANGED");
            return hash.digest();
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    private static void updateEntry(MessageDigest aggregate, String name, long size, byte[] hash) {
        byte[] encodedName = name.getBytes(StandardCharsets.UTF_8);
        aggregate.update(ByteBuffer.allocate(4).putInt(encodedName.length).array());
        aggregate.update(encodedName);
        aggregate.update(ByteBuffer.allocate(8).putLong(size).array());
        aggregate.update(hash);
    }

    private static void checkParents(Path root, Path directory) throws IOException {
        Path current = root;
        if (!directory.startsWith(root)) throw failure("ROOT_INVALID");
        checkDirectory(root, "ROOT_INVALID");
        for (Path component : root.relativize(directory)) {
            current = current.resolve(component);
            if (attributesIfPresent(current) != null) checkDirectory(current, "STORE_NOT_DIRECTORY");
        }
    }

    private static void checkDirectory(Path path, String code) throws IOException {
        BasicFileAttributes attributes = attributesIfPresent(path);
        if (attributes == null) throw failure(code);
        if (attributes.isSymbolicLink()) throw failure("SYMLINK");
        if (!attributes.isDirectory()) throw failure(code);
    }

    private static BasicFileAttributes attributesIfPresent(Path path) throws IOException {
        try { return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS); }
        catch (NoSuchFileException absent) { return null; }
    }

    private static Stamp stamp(Path file) throws IOException {
        BasicFileAttributes attrs = Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (attrs.isSymbolicLink()) throw failure("SYMLINK");
        if (!attrs.isRegularFile()) throw failure("STORE_NOT_FILE");
        return new Stamp(attrs.size(), attrs.lastModifiedTime().toString(),
                String.valueOf(attrs.fileKey()) + "/" + attrs.creationTime());
    }

    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException unavailable) { throw failure("HASH_UNAVAILABLE"); }
    }

    private static String hex(byte[] data) {
        StringBuilder result = new StringBuilder(data.length * 2);
        for (byte value : data) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }

    private static void wipe(Map<String, byte[]> contents) {
        for (byte[] bytes : contents.values()) Arrays.fill(bytes, (byte) 0);
        contents.clear();
    }

    private static SnapshotFailure failure(String code) { return new SnapshotFailure(code); }

    private static final class SnapshotFailure extends IllegalStateException {
        SnapshotFailure(String code) { super(code); }
    }

    private static final class Stamp {
        final long size;
        final String modified, fileKey;
        Stamp(long size, String modified, String fileKey) {
            this.size = size; this.modified = modified; this.fileKey = fileKey;
        }
        @Override public boolean equals(Object other) {
            if (!(other instanceof Stamp)) return false;
            Stamp value = (Stamp) other;
            return size == value.size && modified.equals(value.modified) && fileKey.equals(value.fileKey);
        }
        @Override public int hashCode() { return java.util.Objects.hash(size, modified, fileKey); }
    }
}
