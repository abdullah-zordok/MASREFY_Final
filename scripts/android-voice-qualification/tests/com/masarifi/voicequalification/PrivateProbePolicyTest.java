package com.masarifi.voicequalification;

import java.util.ArrayList;
import java.util.List;

/** Public historical identity only; no Android, private files or keys. */
public final class PrivateProbePolicyTest {
    private static int checks;
    public static void main(String[] args) {
        PrivateProbePolicy.requireNoSplits(null);checks++;
        PrivateProbePolicy.requireNoSplits(new String[0]);checks++;
        rejected(() -> PrivateProbePolicy.requireNoSplits(new String[]{"feature"}));
        rejected(() -> PrivateProbePolicy.requireNoSplits(new String[]{null}));
        rejected(() -> PrivateProbePolicy.requireNoSplits(new String[]{""}));
        valid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        valid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),"/data/data/com.masarifi.mobile"));
        valid(identity(null,null,35,10123,10123,"be33158e282efa4d8ae6b5f1ad9541e1a90ac9a3a42d0d830bbbf7d601346c9f",null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        String preservation="23a5653f5d5c1351189b1bc7f3de4a71c47a391b69bdb9c29edd49267b9aad83";
        valid(identity(null,null,35,10123,10123,preservation,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,preservation,"0".repeat(64),null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,PrivateProbePolicy.TARGET,35,10123,10123,preservation,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10124,preservation,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,PrivateProbePolicy.UPGRADE_APK,"0".repeat(64),null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,PrivateProbePolicy.TARGET,35,10123,10123,PrivateProbePolicy.UPGRADE_APK,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10124,PrivateProbePolicy.UPGRADE_APK,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity("com.other",null,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,PrivateProbePolicy.TARGET,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        for(int api:new int[]{0,34,36}) invalid(identity(null,null,api,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        for(int uid:new int[]{0,1000,9999}) invalid(identity(null,null,35,uid,uid,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10124,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,"0".repeat(64),null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,"0".repeat(64),null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,"0".repeat(64),null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,"android.app.Application",null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,"android.app.AppComponentFactory",false,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,true,0,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,1,providers(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,List.of(),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,List.of(PrivateProbePolicy.TARGET,PrivateProbePolicy.TARGET,PrivateProbePolicy.TARGET,PrivateProbePolicy.PROCESS),List.of(PrivateProbePolicy.TARGET),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.PROCESS),null));
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(),null));
        List<String> unknown=new ArrayList<>(providers());unknown.set(1,null);
        invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,unknown,List.of(PrivateProbePolicy.TARGET),null));
        for(String root:List.of("/data/user/10/com.masarifi.mobile","/data/data/com.other","/data/user/0/com.masarifi.mobile/../com.other"))
            invalid(identity(null,null,35,10123,10123,null,null,null,null,null,false,0,providers(),List.of(PrivateProbePolicy.TARGET),root));
        rejected(() -> PrivateProbePolicy.requireIdentity(null));
        PrivateProbePolicy.requireAdmissionTarget(PrivateProbePolicy.PRESERVATION_APK);checks++;
        for(String apk:new String[]{PrivateProbePolicy.HISTORICAL_APK,PrivateProbePolicy.UPGRADE_APK,null,"0".repeat(64)})
            rejected(() -> PrivateProbePolicy.requireAdmissionTarget(apk));
        PrivateProbePolicy.requireObservedBinding(10123,"10123","a".repeat(64),"a".repeat(64));checks++;
        for(String uid:new String[]{"","0","10124","010123","+10123","secret\n10123"})
            rejected(() -> PrivateProbePolicy.requireObservedBinding(10123,uid,"a".repeat(64),"a".repeat(64)));
        rejected(() -> PrivateProbePolicy.requireObservedBinding(10123,null,"a".repeat(64),"a".repeat(64)));
        rejected(() -> PrivateProbePolicy.requireObservedBinding(10123,"10123",null,"a".repeat(64)));
        rejected(() -> PrivateProbePolicy.requireObservedBinding(10123,"10123","A".repeat(64),"a".repeat(64)));
        rejected(() -> PrivateProbePolicy.requireObservedBinding(10123,"10123","a".repeat(64),"b".repeat(64)));
        System.out.println("PASS private probe identity/binding "+checks+" checks");
    }
    private static List<String> providers(){return List.of(PrivateProbePolicy.TARGET,PrivateProbePolicy.TARGET,PrivateProbePolicy.TARGET,PrivateProbePolicy.TARGET);}
    private static PrivateProbePolicy.Identity identity(String pkg,String process,int api,int uid,int targetUid,String apk,String cert,String probeCert,String app,String factory,boolean debug,int splits,List<String> providers,List<String> components,String root) {
        return new PrivateProbePolicy.Identity(pkg==null?PrivateProbePolicy.TARGET:pkg,process==null?PrivateProbePolicy.PROCESS:process,api,uid,targetUid,
            apk==null?PrivateProbePolicy.HISTORICAL_APK:apk,cert==null?PrivateProbePolicy.CERTIFICATE:cert,probeCert==null?PrivateProbePolicy.CERTIFICATE:probeCert,
            app==null?"com.masarifi.mobile.MainApplication":app,factory==null?"androidx.core.app.CoreComponentFactory":factory,debug,splits,providers,components,
            root==null?"/data/user/0/com.masarifi.mobile":root);
    }
    private static void valid(PrivateProbePolicy.Identity identity){PrivateProbePolicy.requireIdentity(identity);checks++;}
    private static void invalid(PrivateProbePolicy.Identity identity){rejected(() -> PrivateProbePolicy.requireIdentity(identity));}
    private static void rejected(Runnable action) {
        try {action.run();throw new AssertionError("unknown identity accepted");}
        catch(IllegalStateException failure) {if(!"PROBE_IDENTITY_INDETERMINATE".equals(failure.getMessage())||failure.getCause()!=null)throw new AssertionError("unsanitized identity failure");checks++;}
    }
}
