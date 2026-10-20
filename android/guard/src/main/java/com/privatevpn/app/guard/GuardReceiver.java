package com.privatevpn.app.guard;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;

import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Giữ proxy hệ thống KHÔNG BAO GIỜ trỏ vào cổng chết trên TV không có TUN.
 *
 * <p>Bối cảnh (20/10/2026): TV `MiTV-AFZP0` không có TUN nên VPNFlow chạy chế độ proxy hệ thống
 * `127.0.0.1:1081`. Khi ROM dọn app bằng `Force stopping` (PeriodicCleaner), cổng 1081 chết nhưng
 * Android vẫn giữ giá trị proxy ⇒ CẢ TV MẤT MẠNG. Force-stop huỷ toàn bộ alarm của VPNFlow nên
 * bản thân app đó không tự cứu được — vì vậy có app này (package riêng, alarm riêng).
 *
 * <p>Mỗi phút: nếu proxy trỏ vào cổng nội bộ mà cổng KHÔNG ai nghe ⇒ gỡ proxy (:0) để TV có mạng
 * lại ngay, rồi thử đánh thức VPNFlow.
 */
public class GuardReceiver extends BroadcastReceiver {

    private static final String TAG = "VPNFLOW_GUARD";
    public static final String ACTION_TICK = "com.privatevpn.app.guard.TICK";
    private static final String PROXY_VALUE = "127.0.0.1:1081";
    private static final int REQ = 8101;
    private static final long INTERVAL_MS = 60L * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String proxy = Settings.Global.getString(context.getContentResolver(), "http_proxy");
            if (proxy == null) proxy = "";
            if (proxy.startsWith("127.0.0.1")) {
                if (portAlive("127.0.0.1", 1081)) {
                    Log.i(TAG, "proxy " + proxy + " còn sống -> không làm gì");
                } else {
                    Settings.Global.putString(context.getContentResolver(), "http_proxy", ":0");
                    Log.w(TAG, "proxy " + proxy + " CHẾT -> đã gỡ proxy (:0), TV có mạng trở lại");
                    wakeVpnApp(context);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "tick lỗi: " + t.getClass().getSimpleName() + ": " + t.getMessage());
        }
        schedule(context);
    }

    private static boolean portAlive(String host, int port) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 400);
            return true;
        } catch (Throwable t) {
            return false;
        } finally {
            try {
                s.close();
            } catch (Throwable ignored) {
            }
        }
    }

    private static void wakeVpnApp(Context context) {
        try {
            Intent i = new Intent();
            i.setComponent(new ComponentName("com.privatevpn.app.tv.dev", "com.privatevpn.app.MainActivity"));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
            Log.i(TAG, "đã yêu cầu mở VPNFlow");
        } catch (Throwable t) {
            Log.w(TAG, "không mở được VPNFlow (" + t.getClass().getSimpleName() + ") — chỉ cần mở tay 1 lần");
        }
    }

    public static void schedule(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(context, GuardReceiver.class).setAction(ACTION_TICK);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(context, REQ, i, flags);
            long at = SystemClock.elapsedRealtime() + INTERVAL_MS;
            if (Build.VERSION.SDK_INT >= 23) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            }
        } catch (Throwable t) {
            Log.w(TAG, "không hẹn được chuông: " + t.getMessage());
        }
    }
}
