package com.masarifi.voicequalification;

import java.nio.file.Files;

/** A second full snapshot would exceed this test's separately enforced96MiB heap. */
public final class VoiceStoreSnapshotHeapTest {
    public static void main(String[] args) throws Exception {
        var fixture = Files.createTempDirectory("voice-store-bounded-heap-");
        var file = fixture.resolve("files/SQLite/masarifi.db");
        Files.createDirectories(file.getParent());
        try (var source = new java.io.RandomAccessFile(file.toFile(), "rw")) {
            source.setLength(64L * 1024 * 1024);
        }
        try (var snapshot = VoiceStoreSnapshot.capture(fixture)) {
            if (!snapshot.summary().get("totalBytes").equals(64L * 1024 * 1024))
                throw new AssertionError("Full allowed snapshot was not captured");
            if (!snapshot.verifyUnchanged()) throw new AssertionError("Stable full snapshot verification failed");
        }
        System.out.println("PASS:64MiB snapshot and streaming verification within96MiB heap; synthetic fixture retained");
    }
}
