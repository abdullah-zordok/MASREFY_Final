package com.masarifi.voicequalification;

import java.util.Map;

/** Synthetic values only. No files, Android, keys, identifiers or network access. */
public final class LocalAdmissionCollectorTest {
    static final long NOW=1800000000000L, END=NOW+120000L, WEEK=604800000L;
    static final String NONCE="a".repeat(64), OWNER="b".repeat(64);
    static int cases;
    static void check(boolean value) {cases++;if(!value)throw new AssertionError("admission assertion "+cases);}
    static LocalAdmissionCollector fresh(){return new LocalAdmissionCollector(NONCE,NOW,END);}
    static void reject(Runnable run){try{run.run();throw new AssertionError("accepted invalid");}catch(IllegalStateException expected){check(expected.getMessage().equals("ADMISSION_INPUT"));}}
    public static void main(String[] args) {
        var boundary=fresh();boundary.owner(OWNER,15,false);
        boundary.batch(OWNER,true,false,END-WEEK);check(boundary.prunableBatches()==0);
        boundary.batch(OWNER,true,false,END-WEEK-1);check(boundary.prunableBatches()==1);
        boundary.batch(OWNER,false,true,0);boundary.batch(OWNER,true,true,0);check(boundary.prunableBatches()==1);
        var limit=fresh();limit.owner(OWNER,15,false);
        for(int i=0;i<100;i++)limit.batch(OWNER,true,false,NOW);
        check(limit.prunableBatches()==0);limit.batch(OWNER,true,false,NOW);check(limit.prunableBatches()==1);
        var owners=fresh();owners.owner(OWNER,15,false);owners.owner("c".repeat(64),15,false);
        for(int i=0;i<60;i++){owners.batch(OWNER,true,false,NOW);owners.batch("c".repeat(64),true,false,NOW);}
        check(owners.prunableBatches()==0);
        var both=fresh();both.owner(OWNER,15,false);for(int i=0;i<101;i++)both.batch(OWNER,true,false,0);
        check(both.prunableBatches()==101);
        var queues=fresh();queues.owner(OWNER,15,false);
        queues.finance("pending");queues.finance("sending");queues.finance("applied");queues.finance("conflict");queues.finance("rejected");
        check(queues.receipt().get("admissionFinancePending").equals("2"));
        queues.tracking("singleton","{}");check(queues.receipt().get("admissionTrackingRows").equals("1"));
        reject(()->queues.finance("PRIVATE_UNKNOWN"));reject(()->queues.tracking("bad","{}"));reject(()->queues.tracking("singleton","["));
        reject(()->new LocalAdmissionCollector(NONCE,NOW,NOW));reject(()->new LocalAdmissionCollector(NONCE,NOW,NOW+600001));
        reject(()->new LocalAdmissionCollector("bad",NOW,END));reject(()->fresh().batch(OWNER,true,false,-1));
        var binding=fresh();binding.owner(OWNER,15,false);
        Map<String,String> receipt=binding.receipt();check(!receipt.containsKey("admissionOwnerBindings") && !receipt.containsKey("admissionSessionBindings"));check(!receipt.toString().contains(OWNER));check(!receipt.toString().contains("00000000-0000"));
        check(receipt.get("admissionVerdict").equals("BLOCKED_EXTERNAL_ASSURANCES_REQUIRED"));
        check(fresh().receipt().get("admissionLocalStatus").equals("BLOCKED"));
        check(binding.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        check("UNKNOWN".equals(binding.receipt().get("admissionTrackingSources")));
        check("UNKNOWN".equals(binding.receipt().get("admissionNativeIntake")));
        binding.completeTracking(null);
        check(binding.receipt().get("admissionLocalStatus").equals("OBSERVED_NO_LOCAL_BLOCKER"));
        check(binding.receipt().get("admissionTrackingSources").equals("INACTIVE"));
        check(binding.receipt().get("admissionNativeIntake").equals("INACTIVE"));
        reject(()->binding.completeTracking(null));reject(()->binding.sourceRow("ordinary","value"));
        var active=fresh();active.owner(OWNER,15,false);
        active.sourceRow("masarifi.tracking.sources.v1","{\"smsEnabled\":true}");
        check(active.receipt().get("admissionTrackingSources").equals("UNKNOWN"));
        active.completeTracking(null);
        check(active.receipt().get("admissionTrackingSources").equals("ACTIVE"));
        check(active.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        var duplicate=fresh();duplicate.sourceRow("masarifi.tracking.sources.v1","{}");
        reject(()->duplicate.sourceRow("masarifi.tracking.sources.v1","{}"));
        var malformed=fresh();malformed.owner(OWNER,15,false);
        malformed.sourceRow("ordinary","PRIVATE_SENTINEL");
        malformed.sourceRow("masarifi.tracking.sources.v1","PRIVATE_SENTINEL");
        malformed.completeTracking("<map><boolean name=\"suspended\" value=\"false\"/><string name=\"context\">{\"sms\":true}</string></map>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        check(malformed.receipt().get("admissionTrackingSources").equals("UNKNOWN"));
        check(malformed.receipt().get("admissionNativeIntake").equals("ACTIVE"));
        check(malformed.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        check(!malformed.receipt().toString().contains("PRIVATE_SENTINEL"));
        var old=fresh();old.owner(OWNER,14,true);check(old.receipt().get("admissionLocalStatus").equals("BLOCKED"));
        System.out.println("Local admission cases: "+cases);
    }
}
