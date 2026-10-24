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
    /** Đuôi tên miền phải đi gateway CÓ ROUTE riêng (Mac .6 có `.tv360.vn -> Flow3/node-3`). */
    private static final String[] ROUTED_SUFFIXES = {".tv360.vn"};
    /** Gateway ưu tiên cho các đuôi trên (chỉ .6 có route TV360). */
    private static final String ROUTED_GATEWAY = "192.168.100.6:18081";
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
            int i = gw.lastIndexOf(':');
            upstream = new Socket();
            upstream.connect(new InetSocketAddress(gw.substring(0, i),
                    Integer.parseInt(gw.substring(i + 1))), (int) CONNECT_TIMEOUT_MS);
            if (head != null && head.length() > 0) {
                java.io.OutputStream uo = upstream.getOutputStream();
                uo.write(head.getBytes("ISO-8859-1"));
                uo.flush();
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

    /** Gateway cho host: đuôi có route riêng -> ROUTED_GATEWAY (nếu sống) -> còn lại: gateway tốt nhất. */
    private static String pickFor(String host) {
        if (host != null) {
            for (String suffix : ROUTED_SUFFIXES) {
                if (host.endsWith(suffix) || host.equals(suffix.substring(1))) {
                    if (probe(ROUTED_GATEWAY) >= 0) {
                        best = ROUTED_GATEWAY;
                        bestAt = SystemClock.elapsedRealtime();
                        return ROUTED_GATEWAY;
                    }
                    Log.w(TAG, "route " + suffix + ": gateway " + ROUTED_GATEWAY + " chết");
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
    public static String pick() {
        String cur = best;
        if (cur != null && SystemClock.elapsedRealtime() - bestAt < CACHE_MS) return cur;
        // Ưu tiên theo THỨ TỰ (không phải nhanh nhất): .6 (Mac) có route TV360, .5 chỉ để dự phòng.
        String found = null;
        for (String gw : GATEWAYS) {
            if (probe(gw) >= 0) {
                found = gw;
                break;
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
