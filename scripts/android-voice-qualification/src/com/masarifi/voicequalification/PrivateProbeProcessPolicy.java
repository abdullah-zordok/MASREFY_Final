package com.masarifi.voicequalification;

import java.util.List;

/** Same-UID process isolation policy; no platform, store or key access. */
public final class PrivateProbeProcessPolicy {
    public record Record(int uid,int pid,String name) {}
    public static void require(int uid,int pid,String expectedName,List<Record> records) {
        if(records==null)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_LIST_UNAVAILABLE);
        int own=0;
        for(Record record:records) {
            if(record==null)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_RECORD_INVALID);
            if(record.uid()==uid) {
                if(record.pid()!=pid)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SAME_UID_PEER);
                if(!expectedName.equals(record.name()))throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_NAME_MISMATCH);
                own++;
            }
        }
        if(own==0)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SELF_MISSING);
        if(own!=1)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SELF_DUPLICATE);
    }
}
