package com.tvflow.launcher;

import android.accessibilityservice.AccessibilityService;
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

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        android.util.Log.i(TAG, "accessibility đã nối");
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
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
}
