package com.masarifi.voicequalification;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/** Observations only: clean local stores never authorize a real app launch. */
final class LocalAdmissionCollector {
    private static final long SAFE_INTEGER=9007199254740991L, WEEK=604800000L;
    private final String nonce;
    private final long observedAt,deadline;
    private final Map<String,long[]> batches=new TreeMap<>();
    private int financePending,trackingRows;
    private boolean schemaCurrent=true,legacyCleanup;

    LocalAdmissionCollector(String nonce,long observedAt,long deadline) {
        require(nonce!=null && nonce.matches("[0-9a-f]{64}"));
        require(observedAt>=0 && deadline>observedAt && deadline<=SAFE_INTEGER && deadline-observedAt<=600000);
        this.nonce=nonce;this.observedAt=observedAt;this.deadline=deadline;
    }
    void owner(String owner,int schemaVersion,boolean cleanupPending) {
        require(owner!=null && owner.matches("[0-9a-f]{64}"));
        require(!batches.containsKey(owner) && batches.size()<1024);
        batches.put(owner,new long[2]);schemaCurrent &= schemaVersion==15;legacyCleanup |= cleanupPending;
    }
    void legacyPresent(){legacyCleanup=true;}
    void batch(String owner,boolean terminal,boolean audioOwned,long recordedAt) {
        require(batches.containsKey(owner) && recordedAt>=0 && recordedAt<=SAFE_INTEGER);
        if(!terminal || audioOwned)return;
        long[] counts=batches.get(owner);require(++counts[0]<=1024);
        if(recordedAt<deadline-WEEK)counts[1]++;
    }
    long prunableBatches() {
        long total=0;
        for(long[] counts:batches.values())total+=counts[1]+Math.max(0,counts[0]-counts[1]-100);
        return total;
    }
    void finance(String status) {
        require(Set.of("pending","sending","applied","conflict","rejected").contains(status));
        if(status.equals("pending") || status.equals("sending"))financePending++;
    }
    void tracking(String id,String payload) {
        require("singleton".equals(id));
        try {require(StrictJson.parse(payload) instanceof Map<?,?>);}
        catch(RuntimeException invalid){throw failure();}
        // Any stored Tracking state blocks admission until its semantics are independently qualified.
        trackingRows++;
    }
    Map<String,String> receipt() {
        Map<String,String> result=new TreeMap<>();
        result.put("admissionVersion","1");result.put("admissionNonce",nonce);
        result.put("admissionObservedAt",Long.toString(observedAt));result.put("admissionDeadline",Long.toString(deadline));
        result.put("admissionVerdict","BLOCKED_EXTERNAL_ASSURANCES_REQUIRED");
        boolean clean=!batches.isEmpty() && schemaCurrent && !legacyCleanup && prunableBatches()==0 && financePending==0 && trackingRows==0;
        result.put("admissionLocalStatus",clean?"OBSERVED_NO_LOCAL_BLOCKER":"BLOCKED");
        result.put("admissionPrunableBatches",Long.toString(prunableBatches()));
        result.put("admissionFinancePending",Integer.toString(financePending));result.put("admissionTrackingRows",Integer.toString(trackingRows));
        result.put("admissionSchemaCurrent",Boolean.toString(schemaCurrent && !batches.isEmpty()));
        result.put("admissionLegacyCleanup",Boolean.toString(legacyCleanup));
        require(result.toString().length()<=16384);
        return result;
    }
    static void require(boolean condition){if(!condition)throw failure();}
    private static IllegalStateException failure(){return new IllegalStateException("ADMISSION_INPUT");}
}
