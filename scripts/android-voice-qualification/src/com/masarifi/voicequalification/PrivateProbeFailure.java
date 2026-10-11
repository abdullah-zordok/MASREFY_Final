package com.masarifi.voicequalification;

/** Bootstrap metadata failures must never expose exception causes or private values. */
final class PrivateProbeFailure {
    enum Stage {TARGET_METADATA,PROBE_METADATA,TARGET_DECLARATION,TARGET_APK,TARGET_CERTIFICATE,
        PROBE_CERTIFICATE,DATA_ROOT,IDENTITY_POLICY,PROCESS_SURVEY,PROCESS_SERVICE_UNAVAILABLE,
        PROCESS_LIST_UNAVAILABLE,PROCESS_RECORD_INVALID,PROCESS_SAME_UID_PEER,PROCESS_NAME_MISMATCH,
        PROCESS_SELF_MISSING,PROCESS_SELF_DUPLICATE,PROCESS_SURVEY_EXCEPTION,APPLICATION_CLASS,UNEXPECTED}
    enum PeerRole {TARGET_MAIN,PRIVATE_PROCESS_NAME,TARGET_AUXILIARY,OTHER,UNKNOWN_NAME,INVALID_PID}
    static IllegalStateException reject(Stage stage) {
        return new Rejection(stage,null);
    }
    static IllegalStateException rejectPeer(PeerRole role) {
        return new Rejection(Stage.PROCESS_SAME_UID_PEER,role);
    }
    static ClassNotFoundException bootstrap(Stage stage,Throwable rejected) {
        Stage safeStage=rejected instanceof Rejection failure?failure.stage:stage;
        if(safeStage==null)safeStage=Stage.UNEXPECTED;
        PeerRole role=rejected instanceof Rejection failure?failure.peerRole:null;
        return new ClassNotFoundException(message(safeStage,role));
    }
    private static String message(Stage stage,PeerRole role) {
        return "PROBE_IDENTITY_INDETERMINATE:"+stage.name()+
                (stage==Stage.PROCESS_SAME_UID_PEER && role!=null?":PEER_ROLE="+role.name():"");
    }
    private static final class Rejection extends IllegalStateException {
        final Stage stage;
        final PeerRole peerRole;
        Rejection(Stage stage,PeerRole role){super(message(stage,role));this.stage=stage;this.peerRole=role;}
    }
}
