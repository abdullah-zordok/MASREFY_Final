package com.masarifi.voicequalification;

import java.util.Arrays;
import java.util.List;

/** Isolation rejects unknown and competing processes; public synthetic records only. */
public final class PrivateProbeProcessPolicyTest {
    private static final int UID=10304,PID=123;
    private static final String NAME="com.masarifi.mobile:voicequalify";
    private static int checks;
    private static PrivateProbeProcessPolicy.Record own(){return new PrivateProbeProcessPolicy.Record(UID,PID,NAME);}
    public static void main(String[] args) {
        PrivateProbeProcessPolicy.require(UID,PID,NAME,List.of(own()));checks++;
        PrivateProbeProcessPolicy.require(UID,PID,NAME,List.of(new PrivateProbeProcessPolicy.Record(1000,44,"other"),own()));checks++;
        rejected(null,"PROCESS_LIST_UNAVAILABLE");
        rejected(List.of(),"PROCESS_SELF_MISSING");
        rejected(List.of(new PrivateProbeProcessPolicy.Record(1000,44,"other")),"PROCESS_SELF_MISSING");
        rejected(Arrays.asList(own(),null),"PROCESS_RECORD_INVALID");
        rejected(List.of(own(),new PrivateProbeProcessPolicy.Record(UID,124,"peer")),"PROCESS_SAME_UID_PEER");
        rejected(List.of(new PrivateProbeProcessPolicy.Record(UID,PID,"com.masarifi.mobile")),"PROCESS_NAME_MISMATCH");
        rejected(List.of(new PrivateProbeProcessPolicy.Record(UID,PID,null)),"PROCESS_NAME_MISMATCH");
        rejected(List.of(own(),own()),"PROCESS_SELF_DUPLICATE");
        System.out.println("PASS private process isolation "+checks+" checks");
    }
    private static void rejected(List<PrivateProbeProcessPolicy.Record> records,String expectedStage) {
        try {PrivateProbeProcessPolicy.require(UID,PID,NAME,records);throw new AssertionError("Missing process rejection: "+expectedStage);}
        catch(IllegalStateException rejected) {
            ClassNotFoundException safe=PrivateProbeFailure.bootstrap(PrivateProbeFailure.Stage.PROCESS_SURVEY,rejected);
            if(!safe.getMessage().equals("PROBE_IDENTITY_INDETERMINATE:"+expectedStage) || safe.getCause()!=null || safe.getSuppressed().length!=0)
                throw new AssertionError("Incorrect process rejection: "+expectedStage);
            checks++;
        }
    }
}
