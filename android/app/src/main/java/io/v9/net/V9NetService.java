package io.v9.net;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import v9net.V9net;

/**
 * Headless foreground service that runs the gvisor virtual network.
 * Starts on launch, shows a persistent notification, keeps running
 * until explicitly stopped. No UI needed — the browser connects
 * to ws://localhost:8765 from the v9 web app.
 */
public class V9NetService extends Service {
    private static final String TAG = "v9-net";
    private static final String CHANNEL_ID = "v9net_channel";
    private static final int NOTIFICATION_ID = 1;

    // Default config — can be overridden via intent extras
    private static final String DEFAULT_WS_ADDR = ":8765";
    private static final String DEFAULT_PORT_MAPPINGS = "3000:3000";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String wsAddr = DEFAULT_WS_ADDR;
        String ports = DEFAULT_PORT_MAPPINGS;
        boolean debug = false;

        if (intent != null) {
            wsAddr = intent.getStringExtra("wsAddr") != null
                ? intent.getStringExtra("wsAddr") : wsAddr;
            ports = intent.getStringExtra("ports") != null
                ? intent.getStringExtra("ports") : ports;
            debug = intent.getBooleanExtra("debug", false);
        }

        Notification notification = buildNotification(wsAddr, ports);
        startForeground(NOTIFICATION_ID, notification);

        if (!V9net.isRunning()) {
            try {
                V9net.start(wsAddr, ports, debug);
                Log.i(TAG, "v9-net started on " + wsAddr + " ports=" + ports);
            } catch (Exception e) {
                Log.e(TAG, "Failed to start v9-net", e);
                stopSelf();
            }
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        V9net.stop();
        Log.i(TAG, "v9-net stopped");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "v9-net", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Virtual network for v9 browser runtime");
            getSystemService(NotificationManager.class)
                .createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String wsAddr, String ports) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("v9-net active")
            .setContentText("ws://localhost" + wsAddr + " ports=" + ports)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setOngoing(true)
            .build();
    }
}
