package com.tvflow.launcher;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.RouteInfo;
import android.os.SystemClock;
import android.util.Log;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Proxy nội bộ 127.0.0.1:18081 -> gateway LAN sống tốt nhất.
 *
 * Vì sao: SmartTube (và vài app TV khác) KHÔNG dùng system proxy mà chỉ cho nhập proxy tay
 * trong app. Nếu nhập IP gateway cứng thì hôm sau gateway đổi IP / máy đó tắt là chết.
 * Nên app trỏ vào 127.0.0.1 (localhost) — một địa chỉ không bao giờ đổi; còn việc chọn gateway
 * (.6 Mac / .5 Windows / .11 cũ) do lớp này tự dò y như guard, đổi gateway trong ~10 giây.
 *
 * Relay thuần TCP, không sửa dữ liệu: CONNECT/GET của app được chuyển nguyên văn sang gateway.
 */
public class LocalGatewayProxy {
    private static final String TAG = "TVFlowProxy";
    private static final int LISTEN_PORT = 18081;
    // Gateway CÙNG MẠNG được dò động từ default route (router nhà / Mac / Windows / phone...).
    private static final String[] KNOWN_GATEWAYS = {
            "192.168.1.1:18081",
            "192.168.100.101:18081", "192.168.100.5:18081",
            "192.168.100.6:18081", "192.168.100.11:18081"};
    /** Đuôi tên miền phải đi gateway chính (router có route `.tv360.vn -> node-3`). */
    private static final String[] ROUTED_SUFFIXES = {".tv360.vn"};
    private static volatile Context appCtx;

    /** Cần gọi trước start() để biết gateway cùng mạng. */
    public static void init(Context c) {
        if (c != null) appCtx = c.getApplicationContext();
    }

    /** IP gateway mặc định của mạng TV đang nối (VD 192.168.1.1), hoặc null. */
    private static String localGatewayIp() {
        try {
            if (appCtx == null) return null;
            ConnectivityManager cm = (ConnectivityManager)
                    appCtx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            Network[] nets = cm.getAllNetworks();
            if (nets == null) return null;
            for (Network n : nets) {
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (RouteInfo r : lp.getRoutes()) {
                    if (r.isDefaultRoute() && r.getGateway() != null) {
                        String ip = r.getGateway().getHostAddress();
                        if (ip != null && !ip.contains(":")) return ip;
                    }
                }
            }
        } catch (Throwable ignored) { }
        return null;
    }

    /** Gateway chính cùng mạng (ip:18081) hoặc fallback. */
    private static String routedGateway() {
        String ip = localGatewayIp();
        return ip != null ? ip + ":18081" : "192.168.1.1:18081";
    }

    /** Danh sách ứng viên: gateway cùng mạng trước, rồi các máy đã biết. */
    private static java.util.LinkedHashSet<String> candidates() {
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        String local = routedGateway();
        if (local != null) out.add(local);
        for (String gw : KNOWN_GATEWAYS) out.add(gw);
        String cur = best;
        if (cur != null) out.add(cur);
        return out;
    }
    private static final long CACHE_MS = 4_000L;
    private static final long CONNECT_TIMEOUT_MS = 1_200L;

    private static volatile String best;
    private static volatile long bestAt;
    private static volatile boolean started;

    public static synchronized void start() {
        if (started) return;
        started = true;
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                ServerSocket server = null;
                try {
                    server = new ServerSocket();
                    server.setReuseAddress(true);
                    server.bind(new InetSocketAddress("127.0.0.1", LISTEN_PORT));
                    Log.i(TAG, "dang nghe 127.0.0.1:" + LISTEN_PORT);
                    while (true) {
                        final Socket client = server.accept();
                        Thread w = new Thread(new Runnable() {
                            @Override public void run() { relay(client); }
                        }, "gw-proxy-conn");
                        w.setDaemon(true);
                        w.start();
                    }
                } catch (Throwable e) {
                    Log.w(TAG, "server dung: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                    started = false;
                    if (server != null) try { server.close(); } catch (Throwable ignored) { }
                }
            }
        }, "gw-proxy-accept");
        t.setDaemon(true);
        t.start();
    }

    /** Chuyển tiếp một kết nối client sang gateway phù hợp (route theo tên miền nếu có). */
    private static void relay(Socket client) {
        Socket upstream = null;
        try {
            // Đọc phần đầu yêu cầu (CONNECT host:443 / GET http://host/...) để biết đích,
            // rồi mới chọn gateway: TV360 phải đi gateway có route riêng.
            client.setSoTimeout(10000);
            String head = readHead(client.getInputStream());
            String host = hostOf(head);
            String gw = pickFor(host);
            if (gw == null) {
                Log.w(TAG, "khong gateway nao song -> dong ket noi");
                return;
            }
            // Thử LẦN LƯỢT các gateway cho tới khi một cái trả 200. Nhờ vậy khi gateway
            // đang dùng chết giữa chừng, request MỚI vẫn trong suốt với app (không thấy lỗi).
            String[] order = orderFor(host);
            boolean ok = false;
            for (String cand : order) {
                Socket up = null;
                try {
                    int i = cand.lastIndexOf(':');
                    up = new Socket();
                    up.connect(new InetSocketAddress(cand.substring(0, i),
                            Integer.parseInt(cand.substring(i + 1))), (int) CONNECT_TIMEOUT_MS);
                    if (head != null && head.length() > 0) {
                        java.io.OutputStream uo = up.getOutputStream();
                        uo.write(head.getBytes("ISO-8859-1"));
                        uo.flush();
                    }
                    up.setSoTimeout(4000);
                    String resp = readHead(up.getInputStream());
                    if (resp == null || !resp.contains(" 200")) {
                        close(up);
                        continue; // gateway này trả lỗi (502...) -> thử cái kế
                    }
                    upstream = up;
                    gw = cand;
                    ok = true;
                    client.getOutputStream().write(resp.getBytes("ISO-8859-1"));
                    client.getOutputStream().flush();
                    break;
                } catch (Throwable e) {
                    close(up);
                }
            }
            if (!ok) {
                try {
                    client.getOutputStream().write(
                            "HTTP/1.1 502 Bad Gateway\r\n\r\n".getBytes("ISO-8859-1"));
                    client.getOutputStream().flush();
                } catch (Throwable ignored) {
                }
                return;
            }
            client.setSoTimeout(0);
            upstream.setSoTimeout(0);
            Log.i(TAG, "relay " + host + " -> " + gw);
            // Một chiều chạy riêng, chiều còn lại chạy ngay tại đây: relay() phải CHỜ tunnel
            // xong rồi mới đóng socket, nếu không finally sẽ đóng ngay lúc vừa mở
            // (lỗi thật 24/10/2026: nc nhận kết nối rồi bị cắt, SmartTube vẫn đứng hình).
            final Socket up = upstream;
            Thread back = new Thread(new Runnable() {
                @Override public void run() { copy(client, up); }
            }, "gw-proxy-back");
            back.setDaemon(true);
            back.start();
            copy(upstream, client);
        } catch (Throwable e) {
            Log.w(TAG, "relay loi: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        } finally {
            close(upstream);
            close(client);
        }
    }

    /** Chép dữ liệu một chiều tới khi hết; KHÔNG đóng socket (do relay() đóng sau khi cả 2 chiều xong). */
    private static void copy(Socket from, Socket to) {
        byte[] buf = new byte[16 * 1024];
        try {
            InputStream in = from.getInputStream();
            OutputStream out = to.getOutputStream();
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                out.flush();
            }
        } catch (Throwable ignored) {
        }
    }

    /** Đọc phần đầu HTTP request (tới hết dòng trống), tối đa 8 KB. */
    private static String readHead(InputStream in) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try {
            int c;
            int count = 0;
            while ((c = in.read()) != -1) {
                out.write(c);
                if (++count > 8192) break;
                // kết thúc header: 


                if (count >= 4) {
                    byte[] b = out.toByteArray();
                    int n = b.length;
                    if (b[n - 4] == '\r' && b[n - 3] == '\n' && b[n - 2] == '\r' && b[n - 1] == '\n') break;
                }
            }
        } catch (Throwable ignored) {
        }
        return out.size() == 0 ? null : new String(out.toByteArray(), java.nio.charset.StandardCharsets.ISO_8859_1);
    }

    /** Tên host trong dòng đầu: "CONNECT host:443 HTTP/1.1" hoặc "GET http://host/path HTTP/1.1". */
    private static String hostOf(String head) {
        if (head == null) return null;
        try {
            String line = head.split("\r?\n", 2)[0].trim();
            String[] parts = line.split(" ");
            if (parts.length < 2) return null;
            String target = parts[1];
            int scheme = target.indexOf("://");
            if (scheme >= 0) target = target.substring(scheme + 3);
            int slash = target.indexOf('/');
            if (slash >= 0) target = target.substring(0, slash);
            int colon = target.lastIndexOf(':');
            if (colon > 0) target = target.substring(0, colon);
            return target.toLowerCase(java.util.Locale.US);
        } catch (Throwable t) {
            return null;
        }
    }

    /** Thứ tự thử gateway cho host: route riêng trước, rồi gateway đang chọn, rồi còn lại. */
    private static String[] orderFor(String host) {
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        if (host != null) {
            for (String suffix : ROUTED_SUFFIXES) {
                if (host.endsWith(suffix) || host.equals(suffix.substring(1))) {
                    out.add(routedGateway());
                }
            }
        }
        String bestNow = pick();
        if (bestNow != null) out.add(bestNow);
        for (String gw : candidates()) out.add(gw);
        return out.toArray(new String[0]);
    }

    /** Gateway cho host: đuôi có route riêng -> ROUTED_GATEWAY (nếu sống) -> còn lại: gateway tốt nhất. */
    private static String pickFor(String host) {
        if (host != null) {
            for (String suffix : ROUTED_SUFFIXES) {
                if (host.endsWith(suffix) || host.equals(suffix.substring(1))) {
                    String rg = routedGateway();
                    if (probe(rg) >= 0) {
                        best = rg;
                        bestAt = SystemClock.elapsedRealtime();
                        return rg;
                    }
                    Log.w(TAG, "route " + suffix + ": gateway " + rg + " chết");
                }
            }
        }
        return pick();
    }

    /** Gateway cụ thể còn sống không (dùng để bám gateway hiện tại, không nhảy liên tục). */
    public static boolean isAlive(String hostPort) {
        return probe(hostPort) >= 0;
    }

    /** Gateway sống (CONNECT thật trả 200) nhanh nhất; cache 10 giây để không dò liên tục. */
    /**
     * Chọn gateway theo CHẤT LƯỢNG (độ trễ CONNECT thật) trong tất cả gateway còn sống,
     * nhưng có "độ trễ chuyển" (hysteresis): giữ gateway đang dùng nếu nó còn sống và không
     * chậm hơn 2 lần so với gateway nhanh nhất — tránh nhảy qua lại giữa các máy.
     */
    public static String pick() {
        long now = SystemClock.elapsedRealtime();
        String cur = best;
        if (cur != null && now - bestAt < CACHE_MS) return cur;

        String fast = null;
        long fastMs = Long.MAX_VALUE;
        long curMs = -1;
        for (String gw : candidates()) {
            long ms = probe(gw);
            if (ms < 0) continue;
            if (gw.equals(cur)) curMs = ms;
            if (ms < fastMs) {
                fastMs = ms;
                fast = gw;
            }
        }
        String chosen = fast;
        if (cur != null && curMs >= 0 && fast != null && curMs <= fastMs * 2) {
            chosen = cur; // giữ gateway hiện tại (đủ tốt) để không nhảy
        }
        if (chosen != null && !chosen.equals(cur)) {
            Log.i(TAG, "chon gateway " + chosen + " (nhanh nhat " + fast + " " + fastMs + "ms, cu " + cur + " " + curMs + "ms)");
        }
        best = chosen;
        bestAt = now;
        if (found(chosen)) return chosen;
        return chosen;
    }

    private static boolean found(String gw) { return gw != null; }

    /**
     * Probe END-TO-END bằng HTTP proxy thật (absolute-URI GET):
     * phải nhận " 204" thật từ generate_204. Proxy "mở cổng nhưng upstream chết"
     * (Windows gateway mất mạng) sẽ treo/không trả 204 => bị loại.
     */
    private static long probe(String hostPort) {
        int i = hostPort.lastIndexOf(':');
        if (i <= 0) return -1;
        long t0 = SystemClock.elapsedRealtime();
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(hostPort.substring(0, i),
                    Integer.parseInt(hostPort.substring(i + 1))), (int) CONNECT_TIMEOUT_MS);
            s.setSoTimeout(3500);
            OutputStream out = s.getOutputStream();
            out.write(("GET http://www.gstatic.com/generate_204 HTTP/1.1\r\n" +
                    "Host: www.gstatic.com\r\nConnection: close\r\n\r\n").getBytes());
            out.flush();
            boolean ok = readContains(s.getInputStream(), " 204", 640);
            if (!ok) return -1;
            return SystemClock.elapsedRealtime() - t0;
        } catch (Throwable t) {
            return -1;
        } finally {
            close(s);
        }
    }

    /** Đọc tới khi gặp chuỗi cần tìm (hoặc hết max byte). */
    private static boolean readContains(InputStream in, String needle, int max) {
        byte[] buf = new byte[128];
        StringBuilder sb = new StringBuilder();
        int total = 0;
        try {
            while (total < max) {
                int n = in.read(buf, 0, buf.length);
                if (n <= 0) break;
                total += n;
                sb.append(new String(buf, 0, n));
                if (sb.indexOf(needle) >= 0) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    private static void close(Socket s) {
        if (s == null) return;
        try { s.close(); } catch (Throwable ignored) { }
    }
}
