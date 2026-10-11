package com.masarifi.voicequalification.fixture;
import android.app.Activity;
import android.os.Bundle;
public final class TargetActivity extends Activity {
    @Override public void onCreate(Bundle state) { super.onCreate(state); Tripwire.mark(this,"ACTIVITY"); }
}
