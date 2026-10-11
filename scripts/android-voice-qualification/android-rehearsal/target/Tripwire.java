package com.masarifi.voicequalification.fixture;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.net.HttpURLConnection;
import java.net.URL;

/** Deliberate synthetic side effects; this package never contains customer data. */
final class Tripwire {
    static synchronized void mark(Context context, String component) {
        SharedPreferences counters = context.getSharedPreferences("tripwires",0);
        int marks = counters.getInt("marks",0) + 1;
        if (!counters.edit().putInt("marks",marks).commit()) throw new IllegalStateException("FIXTURE_WRITE_FAILED");
        Log.i("VQSFixture","MARK="+marks+" COMPONENT="+component);
        new Thread(Tripwire::notifyLocalListener,"synthetic-startup-tripwire").start();
    }
    private static void notifyLocalListener() {
        HttpURLConnection connection = null;
        try {
            // Android emulator's host-loopback bridge; never a Masarifi endpoint.
            connection = (HttpURLConnection)new URL("http://10.0.2.2:34861/startup").openConnection();
            connection.setConnectTimeout(1500);
            connection.setReadTimeout(1500);
            if (connection.getResponseCode() != 204) throw new IllegalStateException("FIXTURE_LISTENER_RESPONSE");
            Log.i("VQSFixture","LOCAL_REQUEST_COMPLETED");
        } catch (Exception unavailable) { Log.e("VQSFixture","LOCAL_REQUEST_FAILED"); }
        finally { if (connection != null) connection.disconnect(); }
    }
}
