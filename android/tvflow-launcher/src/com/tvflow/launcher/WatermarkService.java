package com.tvflow.launcher;

import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * Overlay logo FPT nho tren video khi app FPT Tubeflow (org.smarttube.stable) dang o tien canh.
 * Chi hien thi khi da duoc cap quyen "Hien thi tren ung dung khac" (SYSTEM_ALERT_WINDOW).
 */
public class WatermarkService extends Service {
    public static final String TARGET = "org.smarttube.stable";
    private static volatile String foreground = "";
    private WindowManager wm;
    private View view;
    private boolean shown;
    private final Handler handler = new Handler(Looper.getMainLooper());

    public static void setForeground(String pkg) {
        foreground = pkg == null ? "" : pkg;
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            try { sync(); } catch (Throwable ignored) { }
            handler.postDelayed(this, 600L);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        handler.post(tick);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        remove();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void sync() {
        boolean canOverlay = Settings.canDrawOverlays(this);
        boolean want = canOverlay && TARGET.equals(foreground);
        if (want && !shown) add();
        else if (!want && shown) remove();
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void add() {
        try {
            ImageView iv = new ImageView(this);
            iv.setImageResource(R.drawable.fpt_logo);
            iv.setAlpha(0.85f);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    dp(84), dp(30),
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.END;
            lp.x = dp(20); lp.y = dp(16);
            wm.addView(iv, lp);
            view = iv;
            shown = true;
        } catch (Throwable ignored) { }
    }

    private void remove() {
        try { if (view != null) wm.removeView(view); } catch (Throwable ignored) { }
        view = null; shown = false;
    }
}
