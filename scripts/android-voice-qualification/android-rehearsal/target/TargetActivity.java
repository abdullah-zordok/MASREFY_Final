package com.masarifi.voicequalification.fixture;
import android.app.Activity;
import android.os.Bundle;
import android.content.res.Configuration;
import android.util.Log;
public final class TargetActivity extends Activity {
    private Configuration previous;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        previous=new Configuration(getResources().getConfiguration());
        Log.i("VQSFixture","TARGET_ACTIVITY_CREATE savedState="+(state!=null));
        Tripwire.mark(this,"ACTIVITY");
    }
    @Override public void onDestroy() {
        Log.i("VQSFixture","TARGET_ACTIVITY_DESTROY changing="+isChangingConfigurations()+
                " configurationMask="+getChangingConfigurations());
        super.onDestroy();
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        Log.i("VQSFixture","TARGET_ACTIVITY_CONFIGURATION_CHANGED diffMask="+
                (previous==null?0:previous.diff(configuration)));
        previous=new Configuration(configuration);
    }
}
