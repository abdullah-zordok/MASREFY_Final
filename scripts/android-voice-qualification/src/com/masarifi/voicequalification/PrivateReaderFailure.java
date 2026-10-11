package com.masarifi.voicequalification;

import java.util.Map;

/** Closed operation labels only. Never accepts a Throwable or private store values. */
final class PrivateReaderFailure {
    enum Stage {
        CONTEXT,
        OBSERVED_BINDING,
        MAIN_LOOP_BARRIER,
        PLAIN_APPLICATION,
        IDENTITY_BEFORE,
        PROCESS_BEFORE,
        DATA_ROOT,
        INITIAL_STAMPS,
        NATIVE_LOAD,
        SNAPSHOT_CAPTURE,
        NATIVE_FILE_IDENTITY,
        SNAPSHOT_STAMPS,
        PROCESS_BEFORE_QUALIFICATION,
        QUALIFICATION,
        SNAPSHOT_UNCHANGED,
        FILE_STAMPS_UNCHANGED,
        DIRECTORY_STAMPS_UNCHANGED,
        IDENTITY_AFTER,
        PROCESS_AFTER,
        RECEIPT_BUILD,
        SNAPSHOT_CLOSE,
        FINISH,
        UNEXPECTED
    }
    static Map<String,String> receipt(Stage stage) {
        return Map.of("verdict","INDETERMINATE","readerStage",(stage==null?Stage.UNEXPECTED:stage).name());
    }
}
