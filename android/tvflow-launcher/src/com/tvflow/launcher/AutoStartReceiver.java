package com.tvflow.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * TV khởi động -> mở TVFlow Home (Xiaomi không cho đặt làm HOME mặc định).
 * Cần quyền SYSTEM_ALERT_WINDOW (appop) để được phép mở activity từ nền.
 */
public class AutoStartReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(i);
            Log.i("TVFlowAuto", "boot -> mo TVFlow Home");
        } catch (Exception e) {
            Log.w("TVFlowAuto", "khong mo duoc: " + e);
        }
    }
}
