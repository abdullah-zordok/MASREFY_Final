package com.masarifi.voicequalification;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/** Synthetic raw-page tests; no application file or database engine is opened. */
public final class CommittedWalSnapshotTest {
    private static int checks;
    private record Frame(int page, int commitPages, byte value) {}

    public static void main(String[] args) throws Exception {
        byte[] database = pages(2, (byte) 7);
        byte[] before = database.clone();
        for (boolean bigEndian : new boolean[]{false, true}) {
            byte[] wal = wal(bigEndian, 512, new Frame(2, 2, (byte) 42), new Frame(2, 0, (byte) 99));
            byte[] originalWal = wal.clone();
            try (var result = reconstruct(database, wal)) {
                check(result.bytes().length == 1024 && result.bytes()[512] == 42,
                        "last committed page wins; valid uncommitted tail excluded");
                check(result.committedFrames() == 1 && result.uncommittedFrames() == 1,
                        "both checksum byte orders and frame counts");
                check(result.bytes()[0] == 7, "unchanged base page retained");
            }
            check(Arrays.equals(database, before) && Arrays.equals(wal, originalWal), "inputs unchanged");
        }
        try (var result = reconstruct(database, wal(false, 512,
                new Frame(2, 0, (byte) 10), new Frame(2, 2, (byte) 11)))) {
            check(result.bytes()[512] == 11 && result.committedFrames() == 2, "repeated pages use last committed version");
        }
        try (var result = reconstruct(database, wal(false, 512, new Frame(1, 1, (byte) 33)))) {
            check(result.bytes().length == 512 && result.bytes()[0] == 33, "commit truncation respected");
        }
        try (var result = reconstruct(database, wal(false, 512, new Frame(3, 3, (byte) 44)))) {
            check(result.bytes().length == 1536 && result.bytes()[1024] == 44, "committed database growth");
        }
        try (var result = reconstruct(database, wal(false, 512, new Frame(1, 0, (byte) 100)))) {
            check(Arrays.equals(result.bytes(), database) && result.committedFrames() == 0,
                    "no committed frames preserve base bytes");
        }
        try (var result = reconstruct(database, null)) {
            byte[] resultBytes = result.bytes();
            check(resultBytes != database && Arrays.equals(resultBytes, database), "missing WAL copies base independently");
            result.close();
            check(allZero(resultBytes), "materialized bytes cleared on close");
            expectFailure(result::bytes, "CLOSED");
        }
        byte[] valid = wal(false, 512, new Frame(2, 2, (byte) 42));
        byte[] badMagic = valid.clone(); badMagic[0] ^= 1;
        expectFailure(() -> reconstruct(database, badMagic), "WAL_HEADER");
        byte[] badHeader = valid.clone(); badHeader[12] ^= 1;
        expectFailure(() -> reconstruct(database, badHeader), "WAL_CHECKSUM");
        byte[] badSalt = valid.clone(); badSalt[40] ^= 1;
        expectFailure(() -> reconstruct(database, badSalt), "WAL_SALT");
        byte[] badPage = valid.clone(); badPage[60] ^= 1;
        expectFailure(() -> reconstruct(database, badPage), "WAL_CHECKSUM");
        expectFailure(() -> reconstruct(database, Arrays.copyOf(valid, valid.length - 1)), "WAL_TRUNCATED");
        expectFailure(() -> reconstruct(database, new byte[31]), "WAL_TRUNCATED");
        expectFailure(() -> reconstruct(database, wal(false, 512, new Frame(0, 2, (byte) 1))), "WAL_PAGE");
        expectFailure(() -> reconstruct(database, wal(false, 512, new Frame(4, 4, (byte) 1))), "WAL_PAGE_GAP");
        expectFailure(() -> reconstruct(database, wal(false, 512,
                new Frame(1, 1, (byte) 1), new Frame(3, 3, (byte) 2))), "WAL_PAGE_GAP");
        try (var result = reconstruct(database, wal(false, 512,
                new Frame(1, 1, (byte) 1), new Frame(2, 0, (byte) 2), new Frame(3, 3, (byte) 3)))) {
            check(result.bytes()[512] == 2 && result.bytes()[1024] == 3, "truncation followed by complete regrowth");
        }
        expectFailure(() -> reconstruct(database, wal(false, 512, new Frame(1, 200000, (byte) 1))), "SIZE_LIMIT");
        expectFailure(() -> reconstruct(new byte[513], valid), "DATABASE_SIZE");
        expectFailure(() -> reconstruct(null, valid), "DATABASE_MISSING");
        expectFailure(() -> reconstruct(new byte[64 * 1024 * 1024 + 1], null), "SIZE_LIMIT");
        for (int size : new int[]{512, 1024, 4096, 65536}) {
            try (var result = reconstruct(new byte[size], wal(true, size, new Frame(1, 1, (byte) 18)))) {
                check(result.bytes().length == size && result.bytes()[size - 1] == 18, "supported page sizes");
            }
        }
        expectFailure(() -> reconstruct(database, wal(false, 256, new Frame(1, 1, (byte) 1))), "WAL_HEADER");
        // A corrupt/stale frame after a commit is indeterminate, never silently ignored.
        byte[] staleTail = wal(false, 512, new Frame(2, 2, (byte) 1), new Frame(1, 0, (byte) 2));
        staleTail[32 + 536 + 8] ^= 1;
        expectFailure(() -> reconstruct(database, staleTail), "WAL_SALT");
        System.out.println("PASS: " + checks + " synthetic committed WAL checks");
    }

    private static CommittedWalSnapshot reconstruct(byte[] database, byte[] wal) {
        return CommittedWalSnapshot.reconstruct(database, wal);
    }
    private interface Action { Object run() throws Exception; }
    private static void expectFailure(Action action, String code) throws Exception {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (IllegalStateException expected) { check(code.equals(expected.getMessage()), "typed sanitized failure: " + code); }
    }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
    private static boolean allZero(byte[] bytes) { for (byte value : bytes) if (value != 0) return false; return true; }
    private static byte[] pages(int count, byte value) { byte[] data = new byte[count * 512]; Arrays.fill(data, value); return data; }
    private static byte[] wal(boolean bigEndian, int pageSize, Frame... frames) {
        ByteBuffer out = ByteBuffer.allocate(32 + frames.length * (24 + pageSize)).order(ByteOrder.BIG_ENDIAN);
        out.putInt(bigEndian ? 0x377f0683 : 0x377f0682).putInt(3007000).putInt(pageSize).putInt(0)
                .putInt(12345).putInt(67890);
        int[] sum = checksum(out.array(), 0, 24, bigEndian, new int[2]);
        out.putInt(sum[0]).putInt(sum[1]);
        for (Frame frame : frames) {
            int start = out.position();
            out.putInt(frame.page()).putInt(frame.commitPages()).putInt(12345).putInt(67890);
            byte[] page = new byte[pageSize]; Arrays.fill(page, frame.value());
            sum = checksum(out.array(), start, 8, bigEndian, sum);
            sum = checksum(page, 0, pageSize, bigEndian, sum);
            out.putInt(sum[0]).putInt(sum[1]).put(page);
        }
        return out.array();
    }
    private static int[] checksum(byte[] data, int offset, int length, boolean bigEndian, int[] initial) {
        ByteBuffer words = ByteBuffer.wrap(data, offset, length).order(bigEndian ? ByteOrder.BIG_ENDIAN : ByteOrder.LITTLE_ENDIAN);
        int first = initial[0], second = initial[1];
        while (words.hasRemaining()) { first += words.getInt() + second; second += words.getInt() + first; }
        return new int[]{first, second};
    }
}
