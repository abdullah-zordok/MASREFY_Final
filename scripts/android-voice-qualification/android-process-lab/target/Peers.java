package com.masarifi.voicequalification.processfixture;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;
import android.os.Parcel;
import android.os.Process;
import android.service.notification.NotificationListenerService;
import android.util.Log;

/** Disposable processes: no files, keys, journals, network or product classes. */
public final class Peers {
    public static class Normal extends Service {
        @Override public IBinder onBind(Intent intent) {
            return new Binder() {
                @Override protected boolean onTransact(int code,Parcel data,Parcel reply,int flags) {
                    data.enforceInterface("public.synthetic.processlab");
                    if(code==IBinder.FIRST_CALL_TRANSACTION) {
                        reply.writeNoException();reply.writeInt(Process.myPid());reply.writeInt(Process.myUid());return true;
                    }
                    if(code==IBinder.FIRST_CALL_TRANSACTION+1) {Process.killProcess(Process.myPid());return true;}
                    return false;
                }
            };
        }
    }
    public static final class Isolated extends Normal {}
    public static final class Listener extends NotificationListenerService {
        @Override public void onListenerConnected() {Log.i("VQSProcessLab","LISTENER_CONNECTED");}
    }
}
