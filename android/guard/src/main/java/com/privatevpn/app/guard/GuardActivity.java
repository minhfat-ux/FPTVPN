package com.privatevpn.app.guard;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;

/**
 * Màn hình duy nhất của app guard: mở một lần để BẬT chuông tự kiểm (1 phút/lần), sau đó có thể
 * thoát. Mở lại cũng vô hại (chỉ hẹn lại chuông).
 */
public class GuardActivity extends Activity {

    private static final String TAG = "VPNFLOW_GUARD";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        GuardReceiver.schedule(this);
        Log.i(TAG, "đã bật chuông tự kiểm 60s");
        TextView tv = new TextView(this);
        tv.setText("VPNFlow Guard\n\nĐang giữ proxy hệ thống: nếu proxy trỏ vào cổng chết thì tự gỡ để TV không mất mạng.\nChuông tự kiểm: 60 giây.\n\nThoát màn hình này là được.");
        tv.setTextSize(18f);
        tv.setPadding(48, 48, 48, 48);
        setContentView(tv);
    }
}
