package com.tvflow.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Khởi động lại watchdog sau khi TV reboot. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            context.startForegroundService(new Intent(context, WatchdogService.class));
        } catch (Exception ignored) { }
    }
}
