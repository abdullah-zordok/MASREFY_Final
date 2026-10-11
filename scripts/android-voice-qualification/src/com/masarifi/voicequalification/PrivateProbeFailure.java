package com.masarifi.voicequalification;

/** Bootstrap metadata failures must never expose exception causes or private values. */
final class PrivateProbeFailure {
    enum Stage {TARGET_METADATA,PROBE_METADATA,TARGET_DECLARATION,TARGET_APK,TARGET_CERTIFICATE,
        PROBE_CERTIFICATE,DATA_ROOT,IDENTITY_POLICY,PROCESS_SURVEY,APPLICATION_CLASS,UNEXPECTED}
    static IllegalStateException reject(Stage stage) {
        return new Rejection(stage);
    }
    static ClassNotFoundException bootstrap(Stage stage,Throwable rejected) {
        Stage safeStage=rejected instanceof Rejection failure?failure.stage:stage;
        if(safeStage==null)safeStage=Stage.UNEXPECTED;
        return new ClassNotFoundException("PROBE_IDENTITY_INDETERMINATE:"+safeStage.name());
    }
    private static final class Rejection extends IllegalStateException {
        final Stage stage;
        Rejection(Stage stage){super("PROBE_IDENTITY_INDETERMINATE");this.stage=stage;}
    }
}
