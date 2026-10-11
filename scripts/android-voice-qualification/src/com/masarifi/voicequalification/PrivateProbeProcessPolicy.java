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
                if(record.pid()!=pid)throw PrivateProbeFailure.rejectPeer(peerRole(expectedName,record));
                if(!expectedName.equals(record.name()))throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_NAME_MISMATCH);
                own++;
            }
        }
        if(own==0)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SELF_MISSING);
        if(own!=1)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SELF_DUPLICATE);
    }
    /** Classify only the first rejected framework record; never a kernel liveness claim. */
    private static PrivateProbeFailure.PeerRole peerRole(String expectedName,Record record) {
        if(record.pid()<=0)return PrivateProbeFailure.PeerRole.INVALID_PID;
        String name=record.name();
        if(name==null || !name.matches("[A-Za-z0-9_.]+(?::[A-Za-z0-9_.]+)?"))
            return PrivateProbeFailure.PeerRole.UNKNOWN_NAME;
        if(name.equals(expectedName))return PrivateProbeFailure.PeerRole.PRIVATE_PROCESS_NAME;
        int separator=expectedName.indexOf(':');
        if(separator<=0)return PrivateProbeFailure.PeerRole.OTHER;
        String target=expectedName.substring(0,separator);
        if(name.equals(target))return PrivateProbeFailure.PeerRole.TARGET_MAIN;
        if(name.startsWith(target+":"))return PrivateProbeFailure.PeerRole.TARGET_AUXILIARY;
        return PrivateProbeFailure.PeerRole.OTHER;
    }
}
