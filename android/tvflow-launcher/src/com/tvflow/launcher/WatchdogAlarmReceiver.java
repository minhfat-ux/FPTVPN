package com.tvflow.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Alarm định kỳ đánh thức WatchdogService nếu tiến trình đã bị hệ thống dọn. */
public class WatchdogAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            context.startForegroundService(new Intent(context, WatchdogService.class));
            Log.i("TVFlowWatchdog", "alarm -> restart service");
        } catch (Exception ignored) { }
    }
}
