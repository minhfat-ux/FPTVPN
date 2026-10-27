package com.tvflow.launcher;

import android.accessibilityservice.AccessibilityService;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

/**
 * Bật lại TVFlow Home NGAY khi launcher Xiaomi (com.mitv.tvhome) nổi lên.
 *
 * Vì sao cần: trên TV Xiaomi, phím HOME luôn bị hệ thống ép mở MiHome trước (đã thử
 * `cmd package set-home-activity` = Success nhưng resolve vẫn ra MiHome; `pm disable-user`
 * component HOME bị SecurityException — máy không root). HomeGuardService dò theo nhịp nên
 * trễ ~0,5-2 s, đủ để thấy màn hình cafe lóe lên. AccessibilityService nhận
 * TYPE_WINDOW_STATE_CHANGED ngay khi cửa sổ đổi => rút ngắn còn vài trăm ms.
 */
public class HomeWatcherService extends AccessibilityService {
    private static final String TAG = "TVFlowWatch";
    private static final String XIAOMI_HOME = "com.mitv.tvhome";
    private long lastBounce = 0L;
    private static final String TUBEFLOW = "org.smarttube.stable";
    private static volatile HomeWatcherService inst;
    private static volatile boolean homeVisible;
    private View logoView;
    private final Handler logoHandler = new Handler(Looper.getMainLooper());

    public static void homeShown() {
        homeVisible = true;
        HomeWatcherService s = inst;
        if (s != null) s.hideLogo();
    }

    public static void homeHidden() {
        homeVisible = false;
    }

    @Override protected void onServiceConnected() {
        inst = this;
        super.onServiceConnected();
        android.util.Log.i(TAG, "accessibility đã nối");
        // Cửa vào THỨ HAI lúc TV vừa bật: hệ thống tự khởi động lại accessibility service sau
        // reboot, kể cả khi Xiaomi chặn BOOT_COMPLETED. Nếu máy vừa bật (< 6 phút), mở TVFlow Home.
        long up = android.os.SystemClock.elapsedRealtime();
        if (up < 6 * 60 * 1000L) {
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                    new Runnable() {
                        @Override public void run() {
                            try {
                                Intent i = new Intent(HomeWatcherService.this, MainActivity.class);
                                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                        | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                                startActivity(i);
                                android.util.Log.i(TAG, "boot (accessibility) -> mo TVFlow Home");
                            } catch (Exception e) {
                                android.util.Log.w(TAG, "khong mo duoc: " + e);
                            }
                        }
                    }, 6000L);
        }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        // Bao cho overlay biet app dang o tien canh (chi ve logo khi FPT Tubeflow).
        String pkg = event.getPackageName().toString();
        if (getPackageName().equals(pkg)) {
            if (homeVisible) hideLogo();
            return;
        }
        boolean tube = TUBEFLOW.equals(pkg);
        if (tube) showLogo(); else hideLogo();
        if (!XIAOMI_HOME.contentEquals(event.getPackageName())) return;
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastBounce < 400) return;   // chống dội
        lastBounce = now;
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
            android.util.Log.i(TAG, "MiHome -> TVFlow Home (accessibility)");
        } catch (Exception e) {
            android.util.Log.w(TAG, "startActivity lỗi: " + e);
        }
    }

    @Override public void onInterrupt() { }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    /** Overlay logo FPT (TYPE_ACCESSIBILITY_OVERLAY: khong can quyen SYSTEM_ALERT_WINDOW). */

    private void showLogo() {
        if (logoView != null) return;
        try {
            WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            ImageView iv = new ImageView(this);
            iv.setImageResource(R.drawable.fpt_logo);
            iv.setAlpha(0.85f);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    dp(84), dp(30),
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.END;
            lp.x = dp(20); lp.y = dp(16);
            wm.addView(iv, lp);
            logoView = iv;
        } catch (Throwable ignored) { }
    }

    private void hideLogo() {
        if (logoView == null) return;
        try {
            WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            wm.removeView(logoView);
        } catch (Throwable ignored) { }
        logoView = null;
    }

    @Override public void onDestroy() {
        hideLogo();
        super.onDestroy();
    }
}
