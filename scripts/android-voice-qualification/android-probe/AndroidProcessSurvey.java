package com.masarifi.voicequalification;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Process;
import java.util.ArrayList;

/** Shared real-probe/fixture adapter; no store, key or mutation capability. */
public final class AndroidProcessSurvey {
    public static void require(Context context,String expectedName) {
        ActivityManager manager;
        try {manager=context.getSystemService(ActivityManager.class);}
        catch(Throwable unavailable) {throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SURVEY_EXCEPTION);}
        if(manager==null)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SERVICE_UNAVAILABLE);
        java.util.List<ActivityManager.RunningAppProcessInfo> processes;
        try {processes=manager.getRunningAppProcesses();}
        catch(Throwable unavailable) {throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_SURVEY_EXCEPTION);}
        if(processes==null)throw PrivateProbeFailure.reject(PrivateProbeFailure.Stage.PROCESS_LIST_UNAVAILABLE);
        var records=new ArrayList<PrivateProbeProcessPolicy.Record>();
        for(var process:processes)records.add(process==null?null:new PrivateProbeProcessPolicy.Record(process.uid,process.pid,process.processName));
        PrivateProbeProcessPolicy.require(Process.myUid(),Process.myPid(),expectedName,records);
    }
}
