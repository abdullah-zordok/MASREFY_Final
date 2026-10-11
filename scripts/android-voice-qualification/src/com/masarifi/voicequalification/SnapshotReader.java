package com.masarifi.voicequalification;

import java.util.function.Consumer;

/** Fixed read-only queries over owned RAM bytes. Row values are private and never logged. */
interface SnapshotReader extends AutoCloseable {
    enum Query { SCHEMA, MIGRATIONS, BATCH, SINGLETON, LEGACY, USER_VERSION, MARKER }
    void visit(Query query, Consumer<Object[]> visitor);
    @Override void close();
    @FunctionalInterface interface Factory { SnapshotReader open(byte[] database, byte[] key); }
}
