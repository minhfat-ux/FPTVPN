package com.tvflow.launcher;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

/**
 * Tự mở TVFlow Home khi TV bật lên.
 *
 * Sự cố thật 24/10/2026: TV bật lên không mở TVFlow Home; `BOOT_COMPLETED` có thể bị Xiaomi chặn
 * hoặc bị bỏ khi app chưa từng chạy sau khi cài. Vì vậy ngoài việc mở ngay, ta hẹn **một chuỗi
 * thử lại** ở 3/15/45/120 giây và một **JobScheduler persisted** (sống qua reboot) để chắc chắn
 * có ít nhất một lần mở thành công.
 */
public class AutoStartReceiver extends BroadcastReceiver {
    private static final String TAG = "TVFlowAuto";
    public static final String ACTION_RETRY = "com.tvflow.launcher.BOOT_RETRY";
    private static final long[] RETRY_MS = {3_000L, 15_000L, 45_000L, 120_000L};

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.i(TAG, "nhan " + action);
        open(context);
        if (ACTION_RETRY.equals(action)) return;
        scheduleRetries(context);
        schedulePersistedJob(context);
    }

    static void open(Context context) {
        try {
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(i);
            Log.i(TAG, "mo TVFlow Home");
        } catch (Exception e) {
            Log.w(TAG, "khong mo duoc: " + e);
        }
    }

    private static PendingIntent pi(Context context, int req) {
        Intent i = new Intent(context, AutoStartReceiver.class).setAction(ACTION_RETRY);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, req, i, flags);
    }

    private static void scheduleRetries(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long base = SystemClock.elapsedRealtime();
        for (int i = 0; i < RETRY_MS.length; i++) {
            PendingIntent p = pi(context, 9100 + i);
            try {
                if (Build.VERSION.SDK_INT >= 23) {
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, base + RETRY_MS[i], p);
                } else {
                    am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, base + RETRY_MS[i], p);
                }
            } catch (Exception ignored) {
            }
        }
    }

    /** Job persisted: Android tự chạy lại sau reboot kể cả khi app chưa từng được mở. */
    private static void schedulePersistedJob(Context context) {
        try {
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            JobInfo job = new JobInfo.Builder(7701,
                    new ComponentName(context, BootJobService.class))
                    .setPersisted(true)
                    .setOverrideDeadline(5000L)
                    .build();
            js.schedule(job);
            Log.i(TAG, "hen job persisted boot");
        } catch (Exception e) {
            Log.w(TAG, "job loi: " + e);
        }
    }
}
