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
import java.net.NetworkInterface;
import java.net.InterfaceAddress;
import java.util.Collections;

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
    private static final long INTERVAL_MS = 15L * 1000L;

    /**
     * Gateway LAN dự phòng, **thử lần lượt theo thứ tự** (ngăn cách bằng dấu phẩy):
     * `192.168.100.11:18081` = laptop Windows chạy `tools/lan-proxy` (chia tải node1+node2),
     * `192.168.100.5:18081` = Mac chạy gateway riêng (dùng khi máy Windows tắt).
     * Ưu tiên gateway TRƯỚC khi gỡ proxy: khi tunnel của VPNFlow chết, TV vẫn giữ được IP Việt Nam
     * thay vì rơi về mạng thẳng (IP Trung Quốc) — giống cách `ProxyDirector` bên app chính làm.
     * Có thể đổi không cần build lại: app này đọc khoá `gateway` trong prefs riêng của nó.
     */
    // Ưu tiên theo ĐỘ ỔN ĐỊNH đo được (24/10): Windows .5 ổn định nhất; điện thoại .101
    // flap 2/5 lần (Wi-Fi power save) nên để sau; Mac .6 chậm do Wi-Fi 2.4G.
    private static final String DEFAULT_GATEWAY =
            "192.168.100.5:18081,192.168.100.6:18081,192.168.100.101:18081,192.168.100.11:18081";
    private static final String PREFS = "vpnflow_guard";
    private static final String KEY_GATEWAY = "gateway";

    @Override
    public void onReceive(Context context, Intent intent) {
        // Phải chạy ở LUỒNG RIÊNG: onReceive nằm trên main thread nên Socket.connect ném
        // NetworkOnMainThreadException => mọi phép dò đều "chết" (lỗi thật 22/10/2026: guard luôn
        // báo "gateway cũng chết" dù gateway sống, rồi gỡ proxy về :0).
        final Context app = context.getApplicationContext();
        schedule(context);
        new Thread(new Runnable() {
            @Override
            public void run() {
                tick(app);
            }
        }, "guard-tick").start();
    }

    private static void tick(Context context) {
        try {
            String proxy = Settings.Global.getString(context.getContentResolver(), "http_proxy");
            if (proxy == null) proxy = "";
            boolean isLoopback = proxy.startsWith("127.0.0.1");
            boolean isGateway = proxy.contains(":") && !proxy.startsWith(":");

            // BÁM gateway đang dùng: còn CONNECT 200 thì GIỮ, không so tốc độ nữa.
            // Lý do (sự cố thật 24/10/2026): mỗi nhịp lại chọn "nhanh nhất" => proxy nhảy
            // .5 <-> .6 giữa lúc đang xem, kết nối OkHttp đang mở đứt => "lúc có video lúc mất".
            if (isGateway && !isLoopback) {
                // Kiểm tra NHANH: gateway hay bị "nửa chết" (cổng TCP vẫn mở nhưng CONNECT
                // treo) — thuật toán cũ chờ tới 10 s/đích nên TV mất mạng cả phút.
                // Ca thật 24/10/2026 02:40: gateway .5 treo, proxy kẹt .5 tới khi tắt/bật VPNFlow.
                long cur = probeQuick(proxy);
                if (cur >= 0) {
                    Log.i(TAG, "gateway " + proxy + " còn sống (" + cur + " ms) -> giữ");
                    return;
                }
                // Xác nhận lần 2 trước khi bỏ gateway: tránh nhảy chỉ vì một nhịp chập chờn.
                long again = probeQuick(proxy);
                if (again >= 0) {
                    Log.i(TAG, "gateway " + proxy + " nhịp lỗi đầu nhưng vẫn sống (" + again + " ms) -> giữ");
                    return;
                }
                Log.w(TAG, "gateway " + proxy + " đã chết (2 lần) -> tìm gateway khác");
            }

            // Proxy nội bộ của launcher (127.0.0.1:18081) — nó tự route theo tên miền
            // (TV360 -> Mac .6, FPT/YouTube -> Windows .5). Còn nghe là giữ.
            if (isLoopback && portAlive("127.0.0.1", 18081)) {
                Log.i(TAG, "proxy nội bộ 127.0.0.1:18081 còn sống -> giữ");
                return;
            }
            if (isLoopback && portAlive("127.0.0.1", 1081)) {
                Log.i(TAG, "proxy " + proxy + " còn sống -> không làm gì");
                return;
            }

            // Chỉ khi gateway hiện tại CHẾT mới chọn gateway khác.
            String best = bestGateway(context, isGateway && !isLoopback ? proxy : null);
            if (best != null) {
                if (best.equals(proxy)) {
                    Log.i(TAG, "gateway " + proxy + " còn sống & nhanh nhất -> giữ");
                } else {
                    Settings.Global.putString(context.getContentResolver(), "http_proxy", best);
                    Log.w(TAG, "gateway " + proxy + " -> chọn gateway tốt nhất " + best);
                }
                return;
            }

            // Không gateway nào trả CONNECT 200. Nếu gateway hiện tại vẫn mở cổng TCP thì có thể
            // tunnel đang bận chốc lát -> GIỮ, tick sau đo lại (không cắt mạng oan bằng :0).
            if (isGateway && tcpAlive(proxy)) {
                Log.w(TAG, "gateway " + proxy + " CONNECT chậm nhưng TCP còn sống -> giữ, thử lại sau");
                return;
            }

            // Chết thật (hoặc đang là 127.0.0.1 chết) và không còn gateway nào -> gỡ proxy (:0).
            Settings.Global.putString(context.getContentResolver(), "http_proxy", ":0");
            Log.w(TAG, "proxy " + proxy + " CHẾT, mọi gateway cũng chết -> gỡ proxy (:0)");
            if (isLoopback) wakeVpnApp(context);
        } catch (Throwable t) {
            Log.w(TAG, "tick lỗi: " + t.getClass().getSimpleName() + ": " + t.getMessage());
        }
    }

    /**
     * Gateway ĐẦU TIÊN còn sống theo thứ tự ưu tiên (không phải "nhanh nhất").
     *
     * Vì sao: TV360 đi qua **route riêng `.tv360.vn`** chỉ có trên gateway Mac (`.6`, bridge nối
     * Flow3/node-3). Gateway Windows `.5` nhanh hơn nhưng KHÔNG có route đó ⇒ chọn `.5` là TV360 chết.
     * Nên ưu tiên tuyệt đối `.6`; `.5` chỉ dùng khi `.6` chết (lúc đó FPT Play vẫn chạy, TV360 tạm mất).
     */
    private static String bestGateway(Context context, String skip) {
        String best = null;
        long bestMs = Long.MAX_VALUE;
        for (String gw : candidates(context, true)) {
            if (skip != null && gw.equals(skip)) continue;
            long ms = probeQuick(gw);
            if (ms >= 0 && ms < bestMs) {
                bestMs = ms;
                best = gw;
            }
        }
        return best;
    }

    /** Quét LAN tìm gateway (host có cổng 18081 mở) — vì IP các máy không cố định. */
    private static final String KEY_DISCOVERED = "discovered_gateways";
    private static final String KEY_DISCOVERED_AT = "discovered_at";
    private static final long DISCOVERY_TTL_MS = 10L * 60L * 1000L; // 10 phút

    /** Trả danh sách gateway: IP quét được (nếu còn mới) + danh sách mặc định (dedup). */
    private static java.util.List<String> candidates(Context context, boolean refreshIfStale) {
        long last = 0L;
        String raw = null;
        try {
            last = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getLong(KEY_DISCOVERED_AT, 0L);
            raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_DISCOVERED, null);
        } catch (Throwable ignored) {
        }
        boolean stale = SystemClock.elapsedRealtime() - last > DISCOVERY_TTL_MS;
        if (refreshIfStale && (stale || raw == null || raw.isEmpty())) {
            raw = scanLan(context);
            try {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                        .putString(KEY_DISCOVERED, raw)
                        .putLong(KEY_DISCOVERED_AT, SystemClock.elapsedRealtime())
                        .apply();
            } catch (Throwable ignored) {
            }
        }
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        if (raw != null) {
            for (String part : raw.split(",")) {
                String v = part.trim();
                if (v.contains(":")) out.add(v);
            }
        }
        for (String gw : gateways(context)) out.add(gw);
        return new java.util.ArrayList<>(out);
    }

    /** Quét /24 hiện tại: host nào mở cổng 18081 thì coi là gateway. */
    private static String scanLan(Context context) {
        try {
            java.util.List<String> subnets = new java.util.ArrayList<>();
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InterfaceAddress ia : nif.getInterfaceAddresses()) {
                    java.net.InetAddress ip = ia.getAddress();
                    if (ip == null || ip.getAddress().length != 4) continue;
                    if (ip.isLoopbackAddress()) continue;
                    int prefix = ia.getNetworkPrefixLength();
                    if (prefix < 24 || prefix > 30) continue; // chỉ quét mạng /24-/30
                    byte[] b = ip.getAddress();
                    String base = (b[0] & 0xff) + "." + (b[1] & 0xff) + "." + (b[2] & 0xff) + ".";
                    if (!subnets.contains(base)) subnets.add(base);
                }
            }
            java.util.Set<String> found = java.util.Collections.synchronizedSet(new java.util.LinkedHashSet<String>());
            for (final String base : subnets) {
                java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(24);
                for (int i = 1; i <= 254; i++) {
                    final String host = base + i;
                    pool.execute(new Runnable() {
                        @Override public void run() {
                            Socket s = new Socket();
                            try {
                                s.connect(new java.net.InetSocketAddress(host, 18081), 350);
                                found.add(host + ":18081");
                            } catch (Throwable ignored) {
                            } finally {
                                try { s.close(); } catch (Throwable ignored) { }
                            }
                        }
                    });
                }
                pool.shutdown();
                try { pool.awaitTermination(15, java.util.concurrent.TimeUnit.SECONDS); } catch (Throwable ignored) { }
            }
            StringBuilder sb = new StringBuilder();
            for (String gw : found) {
                if (sb.length() > 0) sb.append(',');
                sb.append(gw);
            }
            Log.i(TAG, "quet LAN thay gateway: " + sb);
            return sb.toString();
        } catch (Throwable t) {
            Log.w(TAG, "quet LAN loi: " + t.getMessage());
            return "";
        }
    }

    /** Danh sách gateway, thử lần lượt (Windows trước, Mac sau). Prefs riêng, ngăn cách dấu phẩy. */
    private static java.util.List<String> gateways(Context context) {
        String raw = null;
        try {
            raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_GATEWAY, DEFAULT_GATEWAY);
        } catch (Throwable ignored) {
        }
        if (raw == null || !raw.contains(":")) raw = DEFAULT_GATEWAY;
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String part : raw.split(",")) {
            String v = part.trim();
            if (v.contains(":") && !out.contains(v)) out.add(v);
        }
        if (out.isEmpty()) out.add(DEFAULT_GATEWAY);
        return out;
    }

    /** Đích dò: ưu tiên YouTube (đúng ca video), fallback gstatic (đúng ca FPT Play/TV360). */
    private static final String[] PROBE_HOSTS = {
            "www.youtube.com:443", "connectivitycheck.gstatic.com:443", "www.fptplay.net:443"};

    /** Đo gateway bằng CONNECT thật tới đích dò. Trả ms của đích đầu tiên nối được, -1 nếu chết. */
    private static long probeMs(String hostPort) {
        for (String target : PROBE_HOSTS) {
            long ms = probeMs(hostPort, target);
            if (ms >= 0) return ms;
        }
        return -1;
    }

    /** Kiểm nhanh (TCP 1,2 s + CONNECT 4 s) — dùng cho gateway đang dùng. */
    private static long probeQuick(String hostPort) {
        int i = hostPort.lastIndexOf(':');
        if (i <= 0) return -1;
        int port;
        try {
            port = Integer.parseInt(hostPort.substring(i + 1).trim());
        } catch (Throwable t) {
            return -1;
        }
        String host = hostPort.substring(0, i).trim();
        long t0 = android.os.SystemClock.elapsedRealtime();
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 1200);
            s.setSoTimeout(4000);
            s.getOutputStream().write((
                    "CONNECT www.youtube.com:443 HTTP/1.1\r\n" +
                            "Host: www.youtube.com:443\r\n\r\n").getBytes());
            s.getOutputStream().flush();
            byte[] buf = new byte[96];
            int n = s.getInputStream().read(buf);
            if (n <= 0 || !new String(buf, 0, n).contains(" 200")) return -1;
            return android.os.SystemClock.elapsedRealtime() - t0;
        } catch (Throwable t) {
            return -1;
        } finally {
            try { s.close(); } catch (Throwable ignored) { }
        }
    }

    /** CONNECT thật tới `target` qua gateway `hostPort` (10 s). */
    private static long probeMs(String hostPort, String target) {
        int i = hostPort.lastIndexOf(':');
        if (i <= 0) return -1;
        int port;
        try {
            port = Integer.parseInt(hostPort.substring(i + 1).trim());
        } catch (Throwable t) {
            return -1;
        }
        String host = hostPort.substring(0, i).trim();
        long t0 = android.os.SystemClock.elapsedRealtime();
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 2000);
            s.setSoTimeout(8000);
            // Phải kiểm bằng CONNECT thật: proxy mở cổng nhưng upstream chết vẫn trả 502
            // (ca thật 23/10/2026: gateway .5 mở cổng nhưng CONNECT trả 502).
            s.getOutputStream().write((
                    "CONNECT " + target + " HTTP/1.1\r\n" +
                            "Host: " + target + "\r\n\r\n").getBytes());
            s.getOutputStream().flush();
            byte[] buf = new byte[96];
            int n = s.getInputStream().read(buf);
            if (n <= 0) return -1;
            if (!new String(buf, 0, n).contains(" 200")) return -1;
            return android.os.SystemClock.elapsedRealtime() - t0;
        } catch (Throwable t) {
            return -1;
        } finally {
            try {
                s.close();
            } catch (Throwable ignored) {
            }
        }
    }

    /** TCP connect tới host:port (không CONNECT) — để phân biệt "cổng còn mở" với "proxy chết". */
    private static boolean tcpAlive(String hostPort) {
        int i = hostPort.lastIndexOf(':');
        if (i <= 0) return false;
        int port;
        try {
            port = Integer.parseInt(hostPort.substring(i + 1).trim());
        } catch (Throwable t) {
            return false;
        }
        return portAlive(hostPort.substring(0, i).trim(), port);
    }

    private static boolean portAlive(String host, int port) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 800);
            return true;
        } catch (Throwable t) {
            // Ghi rõ lý do: thiếu quyền INTERNET (SecurityException), TV đang ngủ (timeout), v.v.
            Log.w(TAG, "dò " + host + ":" + port + " hỏng: " + t.getClass().getSimpleName() + ": " + t.getMessage());
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
            // HAI chuông song song: nếu một chuỗi bị hệ thống bỏ/nuốt (Xiaomi dọn app, sai giờ,
            // hoặc broadcast bị chặn) thì chuông còn lại vẫn đánh thức guard.
            // Sự cố 24/10: TV bật lên mà không ai scan gateway -> proxy trỏ gateway chết cả tiếng.
            arm(am, context, REQ, INTERVAL_MS);
            arm(am, context, REQ + 1, INTERVAL_MS + 45_000L);
        } catch (Throwable t) {
            Log.w(TAG, "không hẹn được chuông: " + t.getMessage());
        }
    }

    private static void arm(AlarmManager am, Context context, int req, long delayMs) {
        Intent i = new Intent(context, GuardReceiver.class).setAction(ACTION_TICK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(context, req, i, flags);
        long at = SystemClock.elapsedRealtime() + delayMs;
        if (Build.VERSION.SDK_INT >= 23) {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
        } else {
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
        }
    }
}
