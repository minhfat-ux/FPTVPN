package com.tvflow.launcher;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

/**
 * Giữ TVFlow Home ở tiền cảnh: khi launcher gốc Xiaomi (com.mitv.tvhome) nổi lên
 * thì mở lại TVFlow Home. Cần appop GET_USAGE_STATS (cấp qua ADB) để đọc app đang
 * ở trước, và SYSTEM_ALERT_WINDOW để được mở activity từ nền.
 */
public class HomeGuardService extends Service {
    private static final String CHANNEL = "tvflow_guard";
    private static final String XIAOMI_HOME = "com.mitv.tvhome";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastBounce = 0L;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            try { check(); } catch (Exception ignored) { }
            handler.postDelayed(this, 120L);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        startForegroundCompat();
        // Proxy nội bộ cho các app không dùng system proxy (SmartTube...): chúng trỏ
        // localhost, còn gateway do lớp này tự chọn lại khi .5/.6 đổi.
        LocalGatewayProxy.start();
        handler.post(tick);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void startForegroundCompat() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL, "TVFlow Home", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        b.setContentTitle("TVFlow Home")
                .setContentText("Đang giữ màn hình TVFlow Home")
                .setSmallIcon(R.drawable.ic_launcher)
                .setOngoing(true);
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(1, n);
        }
    }

    private void check() {
        long now = System.currentTimeMillis();
        if (now < MainActivity.guardBypassUntil) return;

        UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return;

        UsageEvents events = usm.queryEvents(now - 800, now);
        String top = null;
        UsageEvents.Event e = new UsageEvents.Event();
        while (events != null && events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                top = e.getPackageName();
            }
        }
        if (!XIAOMI_HOME.equals(top) || now - lastBounce < 600) return;

        lastBounce = now;
        Log.i("TVFlowGuard", "MiHome -> TVFlow Home");
        // moveTaskToFront trước: task của mình đã có sẵn trong RAM nên rẻ hơn startActivity
        // (đo 24/10/2026: HOME -> MiHome 217 ms khi dùng cách này, trước đó ~1,9 s).
        try {
            android.app.ActivityManager am =
                    (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            java.util.List<android.app.ActivityManager.AppTask> tasks = am.getAppTasks();
            if (tasks != null && !tasks.isEmpty()) tasks.get(0).moveToFront();
        } catch (Exception ex) {
            Log.w("TVFlowGuard", "moveToFront loi: " + ex);
        }
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } catch (Exception ex) {
            Log.w("TVFlowGuard", "startActivity loi: " + ex);
        }
    }
}
