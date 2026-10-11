package com.masarifi.voicequalification.fixture;
import android.app.Activity;
import android.os.Bundle;
import android.content.res.Configuration;
import android.util.Log;
public final class TargetActivity extends Activity {
    @Override public void onCreate(Bundle state) { super.onCreate(state); Tripwire.mark(this,"ACTIVITY"); }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        Log.i("VQSFixture","TARGET_ACTIVITY_CONFIGURATION_CHANGED");
    }
}
