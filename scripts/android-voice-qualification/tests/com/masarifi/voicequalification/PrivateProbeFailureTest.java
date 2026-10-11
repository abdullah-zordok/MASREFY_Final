package com.masarifi.voicequalification;

/** Public failure stages only; no Android runtime, store, or key access. */
public final class PrivateProbeFailureTest {
    public static void main(String[] args) {
        int checks=0;
        for(PrivateProbeFailure.Stage stage:PrivateProbeFailure.Stage.values()) {
            Throwable sensitive=new IllegalStateException("private-owner/token/path\nCLEAR");
            ClassNotFoundException bootstrap=PrivateProbeFailure.bootstrap(stage,sensitive);
            require(bootstrap.getMessage().equals("PROBE_IDENTITY_INDETERMINATE:"+stage.name()));
            require(bootstrap.getCause()==null && bootstrap.getSuppressed().length==0);
            ClassNotFoundException nested=PrivateProbeFailure.bootstrap(PrivateProbeFailure.Stage.UNEXPECTED,
                    PrivateProbeFailure.reject(stage));
            require(nested.getMessage().equals(bootstrap.getMessage()));
            require(nested.getCause()==null && nested.getSuppressed().length==0);
            checks+=4;
        }
        require(PrivateProbeFailure.bootstrap(null,new Error("private-key"))
                .getMessage().equals("PROBE_IDENTITY_INDETERMINATE:UNEXPECTED"));
        for(PrivateProbeFailure.PeerRole role:PrivateProbeFailure.PeerRole.values()) {
            ClassNotFoundException safe=PrivateProbeFailure.bootstrap(PrivateProbeFailure.Stage.UNEXPECTED,
                    PrivateProbeFailure.rejectPeer(role));
            require(safe.getMessage().equals("PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE="+role.name()));
            require(safe.getCause()==null && safe.getSuppressed().length==0);
            checks+=2;
        }
        System.out.println("PASS private probe sanitized bootstrap failures "+(checks+1)+" checks");
    }
    private static void require(boolean condition) {
        if(!condition)throw new AssertionError("Unsafe bootstrap failure disclosure");
    }
}
