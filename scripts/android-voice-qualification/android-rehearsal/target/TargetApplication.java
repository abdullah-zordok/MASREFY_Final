package com.masarifi.voicequalification.fixture;
import android.app.Application;
import android.util.Log;
public final class TargetApplication extends Application {
    static { Log.i("VQSFixture","TARGET_APPLICATION_CLASS_INITIALIZED"); }
    public TargetApplication() { Log.i("VQSFixture","TARGET_APPLICATION_CONSTRUCTED"); }
    @Override public void onCreate() { super.onCreate(); Tripwire.mark(this,"APPLICATION"); }
}
