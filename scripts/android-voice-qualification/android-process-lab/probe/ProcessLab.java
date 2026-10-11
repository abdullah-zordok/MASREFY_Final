package com.masarifi.voicequalification.processlab;

import android.app.ActivityManager;
import android.app.Application;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.DeadObjectException;
import android.os.IBinder;
import android.os.Parcel;
import android.os.Process;
import com.masarifi.voicequalification.AndroidProcessSurvey;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Evidence lab only. A rejected real probe would not continue to Application. */
public final class ProcessLab extends Instrumentation {
    private static final String TARGET="com.masarifi.voicequalification.processfixture";
    private static final String EXPECTED=TARGET+":inspect";
    private final Bundle receipt=new Bundle();
    private String stage="INITIAL_SURVEY";
    @Override public Application newApplication(ClassLoader loader,String name,Context context)
            throws InstantiationException,IllegalAccessException,ClassNotFoundException {
        if(!TARGET.equals(context.getPackageName()) || !EXPECTED.equals(Application.getProcessName()) ||
                !"android.app.Application".equals(name))throw new ClassNotFoundException("FIXTURE_ONLY");
        try {
            receipt.putString("initialSurvey",survey(context));
            stage="LISTENER_PERMISSION";
            NotificationManager notifications=context.getSystemService(NotificationManager.class);
            if(notifications==null)throw new IllegalStateException("FRAMEWORK_UNAVAILABLE");
            receipt.putString("listenerAccessGranted",Boolean.toString(notifications.isNotificationListenerAccessGranted(
                new ComponentName(TARGET,TARGET+".Peers$Listener"))));
            peer(context,"normal","Normal");
            peer(context,"isolated","Isolated");
            receipt.putString("verdict","PASS_DISPOSABLE_PROCESS_LAB");
        } catch(Exception unavailable) {
            String kind=unavailable.getMessage();
            if(kind==null || !kind.matches("PEER_BIND_FALSE|PEER_READY_TIMEOUT|PEER_NULL_BINDER|PEER_IDENTITY_UNAVAILABLE|PEER_IDENTITY_INVALID|FRAMEWORK_UNAVAILABLE|FRAMEWORK_RECORD_INVALID|DUPLICATE_PEER|PEER_CLEANUP_UNPROVEN"))
                kind=unavailable instanceof SecurityException?"SECURITY_EXCEPTION":unavailable instanceof IllegalStateException?"ILLEGAL_STATE_EXCEPTION":"OTHER_EXCEPTION";
            receipt.clear();receipt.putString("verdict","INDETERMINATE_PROCESS_LAB");
            receipt.putString("failureStage",stage);receipt.putString("failureKind",kind);
        }
        // This synthetic target is already plain and has no startup/data implementation.
        return super.newApplication(loader,Application.class.getName(),context);
    }
    @Override public void onCreate(Bundle arguments) {super.onCreate(arguments);start();}
    @Override public void onStart() {finish("PASS_DISPOSABLE_PROCESS_LAB".equals(receipt.getString("verdict"))?-1:0,receipt);}
    private static String survey(Context context) {
        try {AndroidProcessSurvey.require(context,EXPECTED);return "PASS_ONLY_PRIVATE_PROCESS";}
        catch(Throwable rejected) {
            String marker=rejected.getMessage();
            if(marker!=null && marker.matches("PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE=(TARGET_MAIN|PRIVATE_PROCESS_NAME|TARGET_AUXILIARY|OTHER|UNKNOWN_NAME|INVALID_PID)"))return marker;
            return "UNRECOGNIZED_PROCESS_REJECTION";
        }
    }
    private void peer(Context context,String label,String kind) throws Exception {
        CountDownLatch ready=new CountDownLatch(1);IBinder[] endpoint=new IBinder[1];
        ServiceConnection connection=new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName component,IBinder binder) {endpoint[0]=binder;ready.countDown();}
            @Override public void onServiceDisconnected(ComponentName component) {}
        };
        Intent intent=new Intent().setComponent(new ComponentName(TARGET,TARGET+".Peers$"+kind));
        stage=label+"_BIND";
        boolean bound=context.bindService(intent,Context.BIND_AUTO_CREATE,Runnable::run,connection);
        receipt.putString(label+"Bound",Boolean.toString(bound));
        int peerPid=-1;
        Exception firstFailure=null;String firstFailureStage=null;
        try {
            stage=label+"_READY";
            if(!bound)throw new IllegalStateException("PEER_BIND_FALSE");
            if(!ready.await(5,TimeUnit.SECONDS))throw new IllegalStateException("PEER_READY_TIMEOUT");
            if(endpoint[0]==null)throw new IllegalStateException("PEER_NULL_BINDER");
            stage=label+"_IDENTITY";
            Parcel request=Parcel.obtain(),reply=Parcel.obtain();
            try {
                request.writeInterfaceToken("public.synthetic.processlab");
                if(!endpoint[0].transact(IBinder.FIRST_CALL_TRANSACTION,request,reply,0))throw new IllegalStateException("PEER_IDENTITY_UNAVAILABLE");
                reply.readException();peerPid=reply.readInt();int actualUid=reply.readInt();
                if(peerPid<=0 || actualUid<10000)throw new IllegalStateException("PEER_IDENTITY_INVALID");
                receipt.putString(label+"ActualUidMatches",Boolean.toString(actualUid==Process.myUid()));
            } finally {request.recycle();reply.recycle();}
            stage=label+"_FRAMEWORK";
            var records=context.getSystemService(ActivityManager.class).getRunningAppProcesses();
            if(records==null)throw new IllegalStateException("FRAMEWORK_UNAVAILABLE");
            boolean visible=false,uidMatches=false;int others=0;
            for(var record:records) {
                if(record==null)throw new IllegalStateException("FRAMEWORK_RECORD_INVALID");
                if(record.pid==peerPid) {if(visible)throw new IllegalStateException("DUPLICATE_PEER");visible=true;uidMatches=record.uid==Process.myUid();}
                else if(record.uid==Process.myUid() && record.pid!=Process.myPid())others++;
            }
            receipt.putString(label+"FrameworkVisible",Boolean.toString(visible));
            receipt.putString(label+"FrameworkUidMatches",Boolean.toString(uidMatches));
            if(label.equals("isolated"))receipt.putString("isolatedOtherSameUidPeers",Integer.toString(others));
            stage=label+"_GUARD";receipt.putString(label+"Guard",survey(context));
        } catch(Exception failed) {firstFailure=failed;firstFailureStage=stage;}
        finally {
            stage=label+"_UNBIND";
            try {if(bound)context.unbindService(connection);}
            catch(Exception failed) {if(firstFailure==null){firstFailure=failed;firstFailureStage=stage;}}
            stage=label+"_STOP";
            receipt.putString(label+"StopAlreadyDead","false");
            try {
                if(endpoint[0]!=null) {
                    Parcel stop=Parcel.obtain();
                    try {stop.writeInterfaceToken("public.synthetic.processlab");endpoint[0].transact(IBinder.FIRST_CALL_TRANSACTION+1,stop,null,IBinder.FLAG_ONEWAY);}
                    finally {stop.recycle();}
                }
            }
            catch(DeadObjectException alreadyDead) {
                // Unbinding can end the child before the stop transaction. This is
                // not proof of cleanup: framework absence AND active Binder death
                // must still be established below, and earlier failures still win.
                receipt.putString(label+"StopAlreadyDead","true");
            }
            catch(Exception failed) {if(firstFailure==null){firstFailure=failed;firstFailureStage=stage;}}
            if(firstFailure!=null){stage=firstFailureStage;throw firstFailure;}
        }
        stage=label+"_CLEANUP";
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean gone=false;
        // Fixture cleanup only. The production guard is unchanged and never retries.
        while(System.nanoTime()<end) {
            var records=context.getSystemService(ActivityManager.class).getRunningAppProcesses();
            if(records==null)throw new IllegalStateException("FRAMEWORK_UNAVAILABLE");
            boolean present=false;for(var record:records)if(record==null)throw new IllegalStateException("FRAMEWORK_RECORD_INVALID");else if(record.pid==peerPid)present=true;
            if(!present) {
                // unbindService removes the framework death monitor. isBinderAlive
                // alone can retain a stale true cache until an active transaction.
                boolean cached=endpoint[0].isBinderAlive();
                if(!endpoint[0].pingBinder() && !endpoint[0].isBinderAlive()) {
                    receipt.putString(label+"CachedAliveBeforePing",Boolean.toString(cached));
                    gone=true;break;
                }
            }
            Thread.sleep(20);
        }
        receipt.putString(label+"Gone",Boolean.toString(gone));
        if(!gone)throw new IllegalStateException("PEER_CLEANUP_UNPROVEN");
    }
}
