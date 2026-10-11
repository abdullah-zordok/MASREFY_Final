package com.masarifi.voicequalification;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/** Test-only bridge for freshly generated disposable SQLite/SQLCipher fixtures. */
public final class WalFixtureReconstruction {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("SYNTHETIC_FIXTURE_REQUIRED");
        Path root = Path.of(args[0]);
        if (!"synthetic-wal-test-v1".equals(Files.readString(root.resolve("fixture-marker"))))
            throw new IllegalArgumentException("SYNTHETIC_FIXTURE_REQUIRED");
        byte[] database = Files.readAllBytes(root.resolve("captured.db"));
        byte[] wal = Files.readAllBytes(root.resolve("captured.wal"));
        try (var snapshot = CommittedWalSnapshot.reconstruct(database, wal)) {
            Files.write(root.resolve("reconstructed.db"), snapshot.bytes(), StandardOpenOption.CREATE_NEW);
            if (snapshot.committedFrames() < 1) throw new AssertionError("COMMITTED_FIXTURE_REQUIRED");
            System.out.println("PASS: synthetic WAL materialized; committedFrames=" + snapshot.committedFrames());
        } finally {
            java.util.Arrays.fill(database, (byte) 0);
            java.util.Arrays.fill(wal, (byte) 0);
        }
    }
}
