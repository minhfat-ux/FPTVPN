package com.tvflow.launcher;

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
    private static final String[] GATEWAYS = {
            "192.168.100.6:18081", "192.168.100.5:18081", "192.168.100.11:18081"};
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

    /** Chuyển tiếp một kết nối client sang gateway đang tốt nhất. */
    private static void relay(Socket client) {
        Socket upstream = null;
        try {
            String gw = pick();
            if (gw == null) {
                Log.w(TAG, "khong gateway nao song -> dong ket noi");
                return;
            }
            int i = gw.lastIndexOf(':');
            upstream = new Socket();
            upstream.connect(new InetSocketAddress(gw.substring(0, i),
                    Integer.parseInt(gw.substring(i + 1))), (int) CONNECT_TIMEOUT_MS);
            client.setSoTimeout(0);
            upstream.setSoTimeout(0);
            Log.i(TAG, "relay -> " + gw);
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

    /** Gateway cụ thể còn sống không (dùng để bám gateway hiện tại, không nhảy liên tục). */
    public static boolean isAlive(String hostPort) {
        return probe(hostPort) >= 0;
    }

    /** Gateway sống (CONNECT thật trả 200) nhanh nhất; cache 10 giây để không dò liên tục. */
    private static String pick() {
        String cur = best;
        if (cur != null && SystemClock.elapsedRealtime() - bestAt < CACHE_MS) return cur;
        String found = null;
        long bestMs = Long.MAX_VALUE;
        for (String gw : GATEWAYS) {
            long ms = probe(gw);
            if (ms >= 0 && ms < bestMs) {
                bestMs = ms;
                found = gw;
            }
        }
        best = found;
        bestAt = SystemClock.elapsedRealtime();
        if (found == null) Log.w(TAG, "moi gateway deu chet");
        return found;
    }

    /** CONNECT thật tới gstatic: proxy mở cổng nhưng upstream chết vẫn trả 502. */
    private static long probe(String hostPort) {
        int i = hostPort.lastIndexOf(':');
        if (i <= 0) return -1;
        long t0 = SystemClock.elapsedRealtime();
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(hostPort.substring(0, i),
                    Integer.parseInt(hostPort.substring(i + 1))), (int) CONNECT_TIMEOUT_MS);
            s.setSoTimeout(4000);
            s.getOutputStream().write((
                    "CONNECT www.youtube.com:443 HTTP/1.1\r\n" +
                            "Host: www.youtube.com:443\r\n\r\n").getBytes());
            s.getOutputStream().flush();
            byte[] buf = new byte[96];
            int n = s.getInputStream().read(buf);
            if (n <= 0 || !new String(buf, 0, n).contains(" 200")) return -1;
            return SystemClock.elapsedRealtime() - t0;
        } catch (Throwable t) {
            return -1;
        } finally {
            close(s);
        }
    }

    private static void close(Socket s) {
        if (s == null) return;
        try { s.close(); } catch (Throwable ignored) { }
    }
}
