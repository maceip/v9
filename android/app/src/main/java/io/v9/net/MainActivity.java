package io.v9.net;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Invisible launcher activity — starts the foreground service and finishes.
 * Tap the icon → service starts → notification appears → activity closes.
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent serviceIntent = new Intent(this, V9NetService.class);
        serviceIntent.putExtra("wsAddr", ":8765");
        serviceIntent.putExtra("ports", "3000:3000,3001:3001");
        serviceIntent.putExtra("debug", true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        Toast.makeText(this, "v9-net started on :8765", Toast.LENGTH_SHORT).show();
        finish();
    }
}
