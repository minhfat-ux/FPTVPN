package com.tvflow.launcher;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Giữ system proxy luôn trỏ tới một upstream còn sống:
 *
 *   1. 127.0.0.1:1081        — HTTP proxy trong app VPNFlow ngay trên TV (ưu tiên)
 *   2. 192.168.100.11:18081  — gateway laptop Windows (relay + http-socks-bridge)
 *   3. 192.168.100.5:18081   — Mac (cùng cơ chế, dự phòng thứ hai)
 *
 * Nếu tất cả đều chết thì xoá proxy (fail-open) để TV còn Internet trực tiếp.
 *
 * Vì sao cần: keepalive của VPNFlow xoá "proxy hệ thống còn sót" mỗi ~10 phút, và
 * hệ thống có thể dọn app khi TV thiếu RAM. Không có watchdog thì FPT Play quay về
 * đi thẳng bằng IP Trung Quốc và không load content.
 */
public class WatchdogService extends Service {

    private static final String TAG = "TVFlowWatchdog";
    private static final String CHANNEL = "tvflow_watchdog";
    private static final long INTERVAL_MS = 5_000L;
    private static final int CLEAR_AFTER_FAILS = 4;

    private static final String LOCAL = "127.0.0.1:1081";
    private static final String DEFAULT_GATEWAYS =
            "192.168.100.11:18081,192.168.100.5:18081";

    private HandlerThread workerThread;
    private Handler handler;
    private int deadStreak = 0;
    private int localFailStreak = 0;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            reconcile();
            scheduleAlarm();
            handler.postDelayed(this, INTERVAL_MS);
        }
    };

    private String gateways() {
        SharedPreferences sp = getSharedPreferences("tvflow_home", MODE_PRIVATE);
        return sp.getString("gateway_proxies", DEFAULT_GATEWAYS);
    }

    /** Đánh thức lại service sau 2 phút nếu tiến trình bị dọn (LMK / TV dọn app). */
    private void scheduleAlarm() {
        try {
            AlarmManager am = getSystemService(AlarmManager.class);
            if (am == null) return;
            Intent i = new Intent(this, WatchdogAlarmReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(this, 42, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            long at = System.currentTimeMillis() + 60_000L;
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                } catch (SecurityException se) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } else {
                am.set(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "scheduleAlarm loi: " + e);
        }
    }

    /**
     * Kiểm tra proxy có THẬT SỰ chuyển được traffic: gửi GET tuyệt đối qua proxy
     * và chờ dòng trạng thái HTTP. Cổng mở nhưng tunnel chết vẫn bị coi là hỏng.
     */
    private boolean httpViaProxy(String hostPort) {
        if (hostPort == null || hostPort.length() == 0) return false;
        int idx = hostPort.lastIndexOf(':');
        if (idx <= 0) return false;
        String host = hostPort.substring(0, idx);
        int port;
        try {
            port = Integer.parseInt(hostPort.substring(idx + 1).trim());
        } catch (NumberFormatException e) {
            return false;
        }
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 500);
            s.setSoTimeout(3000);
            OutputStream out = s.getOutputStream();
            String req = "GET http://connectivitycheck.gstatic.com/generate_204 HTTP/1.1\r\n"
                    + "Host: connectivitycheck.gstatic.com\r\nConnection: close\r\n\r\n";
            out.write(req.getBytes("US-ASCII"));
            out.flush();
            BufferedReader r = new BufferedReader(new InputStreamReader(s.getInputStream(), "US-ASCII"));
            String status = r.readLine();
            return status != null && status.contains("204");
        } catch (Exception e) {
            return false;
        } finally {
            try { s.close(); } catch (Exception ignored) { }
        }
    }

    private boolean probe(String hostPort) {
        if (hostPort == null || hostPort.length() == 0) return false;
        int idx = hostPort.lastIndexOf(':');
        if (idx <= 0) return false;
        String host = hostPort.substring(0, idx);
        int port;
        try {
            port = Integer.parseInt(hostPort.substring(idx + 1).trim());
        } catch (NumberFormatException e) {
            return false;
        }
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 400);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "probe " + hostPort + " loi: " + e);
            return false;
        } finally {
            try { s.close(); } catch (Exception ignored) { }
        }
    }

    private void reconcile() {
        String current = null;
        try {
            current = Settings.Global.getString(getContentResolver(), "http_proxy");
        } catch (Exception ignored) { }

        boolean localTcp = probe(LOCAL);
        boolean localHealthy = localTcp && httpViaProxy(LOCAL);
        if (!localHealthy) {
            localFailStreak++;
        } else {
            localFailStreak = 0;
        }
        // chỉ coi TV proxy là "chết" sau 2 lần hỏng liên tiếp (tránh flap)
        boolean localOk = localHealthy || (localTcp && localFailStreak < 2);

        String chosen = localOk ? LOCAL : null;
        String chosenBy = localOk ? "tv" : null;

        if (chosen == null) {
            for (String gw : gateways().split(",")) {
                String g = gw.trim();
                if (g.length() == 0) continue;
                if (probe(g) && httpViaProxy(g)) { chosen = g; chosenBy = "gateway"; break; }
            }
        }

        Log.i(TAG, "tick local=" + localOk + "(tcp=" + localTcp + ",fail=" + localFailStreak + ") chosen=" + chosen + " cur=" + current);

        try {
            if (chosen != null) {
                deadStreak = 0;
                if (!chosen.equals(current)) {
                    Settings.Global.putString(getContentResolver(), "http_proxy", chosen);
                    Log.i(TAG, "proxy -> " + chosen + " (" + chosenBy + ")");
                }
            } else {
                deadStreak++;
                boolean ours = LOCAL.equals(current) || isGateway(current);
                if (ours && deadStreak >= CLEAR_AFTER_FAILS) {
                    Settings.Global.putString(getContentResolver(), "http_proxy", ":0");
                    Log.i(TAG, "proxy cleared (khong upstream nao song, " + deadStreak + " lan)");
                }
            }
        } catch (SecurityException e) {
            Log.w(TAG, "thiếu WRITE_SECURE_SETTINGS: " + e.getMessage());
        }
    }

    private boolean isGateway(String value) {
        if (value == null) return false;
        for (String gw : gateways().split(",")) {
            if (gw.trim().equals(value)) return true;
        }
        return false;
    }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL, "TVFlow Watchdog", NotificationManager.IMPORTANCE_MIN));
        }
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("TVFlow Home")
                .setContentText("Giữ proxy VPN cho FPT Play")
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setOngoing(true)
                .build();
        startForeground(101, n);
        workerThread = new HandlerThread("tvflow-watchdog");
        workerThread.start();
        handler = new Handler(workerThread.getLooper());
        handler.post(tick);
        scheduleAlarm();
        Log.i(TAG, "watchdog started, interval=" + INTERVAL_MS + "ms");
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override public void onDestroy() {
        if (handler != null) handler.removeCallbacks(tick);
        if (workerThread != null) workerThread.quitSafely();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
