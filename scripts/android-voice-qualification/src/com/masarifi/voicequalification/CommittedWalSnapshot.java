package com.masarifi.voicequalification;

import java.util.Arrays;
import java.util.BitSet;

/**
 * Materializes committed raw WAL pages in memory; never opens a database or file.
 * This is not a journal classifier, SQLCipher reader, or no-replay verdict.
 * Callers must independently exclude rollback journals and quiesce the source.
 */
public final class CommittedWalSnapshot implements AutoCloseable {
    private static final int LIMIT = 64 * 1024 * 1024;
    private final byte[] data;
    private final int committedFrames;
    private final int uncommittedFrames;
    private boolean closed;

    private CommittedWalSnapshot(byte[] data, int committedFrames, int uncommittedFrames) {
        this.data = data;
        this.committedFrames = committedFrames;
        this.uncommittedFrames = uncommittedFrames;
    }

    public static CommittedWalSnapshot reconstruct(byte[] database, byte[] wal) {
        if (database == null) throw failure("DATABASE_MISSING");
        if ((long) database.length + (wal == null ? 0 : wal.length) > LIMIT) throw failure("SIZE_LIMIT");
        if (wal == null || wal.length == 0) return retainCopy(database);
        if (wal.length < 32) throw failure("WAL_TRUNCATED");
        int magic = word(wal, 0, true);
        int pageSize = word(wal, 8, true);
        if ((magic & 0xfffffffe) != 0x377f0682 || word(wal, 4, true) != 3007000 ||
                pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) != 0)
            throw failure("WAL_HEADER");
        if (database.length % pageSize != 0) throw failure("DATABASE_SIZE");
        int frameSize = pageSize + 24;
        if ((wal.length - 32) % frameSize != 0) throw failure("WAL_TRUNCATED");
        int frameCount = (wal.length - 32) / frameSize;
        boolean bigEndianChecksum = (magic & 1) != 0;
        int[] checksum = new int[2];
        checksum(wal, 0, 24, bigEndianChecksum, checksum);
        validateChecksum(wal, 24, checksum);
        int lastCommit = 0, finalPages = database.length / pageSize;
        int maximumPages = LIMIT / pageSize;
        for (int index = 0; index < frameCount; index++) {
            int offset = 32 + index * frameSize;
            int page = word(wal, offset, true);
            int commitPages = word(wal, offset + 4, true);
            if (page <= 0 || page > maximumPages) throw failure("WAL_PAGE");
            if (commitPages < 0 || commitPages > maximumPages) throw failure("SIZE_LIMIT");
            if (word(wal, offset + 8, true) != word(wal, 16, true) ||
                    word(wal, offset + 12, true) != word(wal, 20, true)) throw failure("WAL_SALT");
            checksum(wal, offset, 8, bigEndianChecksum, checksum);
            checksum(wal, offset + 24, pageSize, bigEndianChecksum, checksum);
            validateChecksum(wal, offset + 16, checksum);
            if (commitPages != 0) { lastCommit = index + 1; finalPages = commitPages; }
        }

        // Validate every byte/frame, including valid uncommitted tails, before allocation.
        // Invalid/stale tails are conservatively indeterminate instead of being ignored.
        byte[] materialized = Arrays.copyOf(database, finalPages * pageSize);
        boolean transferred = false;
        try {
            BitSet availablePages = new BitSet(maximumPages);
            availablePages.set(0, database.length / pageSize);
            for (int index = 0; index < lastCommit; index++) {
                int offset = 32 + index * frameSize;
                int page = word(wal, offset, true);
                int commitPages = word(wal, offset + 4, true);
                availablePages.set(page - 1);
                if (page <= finalPages)
                    System.arraycopy(wal, offset + 24, materialized, (page - 1) * pageSize, pageSize);
                if (commitPages != 0) {
                    if (availablePages.nextClearBit(0) < commitPages) throw failure("WAL_PAGE_GAP");
                    availablePages.clear(commitPages, maximumPages);
                    // A later regrowth cannot resurrect pages removed by an earlier commit.
                    if (commitPages < finalPages)
                        Arrays.fill(materialized, commitPages * pageSize, materialized.length, (byte) 0);
                }
            }
            CommittedWalSnapshot result = new CommittedWalSnapshot(materialized, lastCommit, frameCount - lastCommit);
            transferred = true;
            return result;
        } finally {
            if (!transferred) Arrays.fill(materialized, (byte) 0);
        }
    }

    // Package-private only: never expose raw private pages in a diagnostic receipt.
    byte[] bytes() { requireOpen(); return data; }
    public int committedFrames() { requireOpen(); return committedFrames; }
    public int uncommittedFrames() { requireOpen(); return uncommittedFrames; }
    @Override public void close() { Arrays.fill(data, (byte) 0); closed = true; }
    private void requireOpen() { if (closed) throw failure("CLOSED"); }
    private static IllegalStateException failure(String code) { return new IllegalStateException(code); }

    private static CommittedWalSnapshot retainCopy(byte[] source) {
        byte[] copy = source.clone();
        boolean transferred = false;
        try {
            CommittedWalSnapshot result = new CommittedWalSnapshot(copy, 0, 0);
            transferred = true;
            return result;
        } finally { if (!transferred) Arrays.fill(copy, (byte) 0); }
    }

    private static int word(byte[] data, int offset, boolean bigEndian) {
        int first = bigEndian ? offset : offset + 3;
        int step = bigEndian ? 1 : -1;
        return ((data[first] & 255) << 24) | ((data[first + step] & 255) << 16) |
                ((data[first + 2 * step] & 255) << 8) | (data[first + 3 * step] & 255);
    }
    private static void checksum(byte[] data, int offset, int length, boolean bigEndian, int[] state) {
        for (int position = offset; position < offset + length; position += 8) {
            state[0] += word(data, position, bigEndian) + state[1];
            state[1] += word(data, position + 4, bigEndian) + state[0];
        }
    }
    private static void validateChecksum(byte[] wal, int offset, int[] state) {
        if (word(wal, offset, true) != state[0] || word(wal, offset + 4, true) != state[1])
            throw failure("WAL_CHECKSUM");
    }
}
