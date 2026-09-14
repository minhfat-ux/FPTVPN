using System.Diagnostics;
using System.Net;
using System.Net.Sockets;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// WireGuard-over-TCP relay client — port trung thực của
/// <c>WGRelayClient.swift</c> (iOS/PrivateVPNPacketTunnel/WGRelayClient.swift:18-388).
///
/// WireGuard trỏ vào listener UDP local ở đây. Mỗi datagram được bọc trong frame
/// TCP độ dài tiền tố <c>[length: u16 big-endian][payload]</c> rồi gửi tới relay
/// daemon cạnh exit node; relay bung ra UDP tới cổng WireGuard của node (và trả lời
/// ngược lại). Cùng giao thức với <c>tools/node-setup/relay.go:59-102</c>.
///
/// Cổng UDP local giữ nguyên suốt vòng đời tunnel, kể cả khi TCP reconnect, nên
/// WireGuard không phải cấu hình lại.
/// </summary>
public sealed class WgRelayClient : ITunnelTransport
{
    private const int MaxDatagramBytes = 65_535;
    private const int ConnectTimeoutMs = 10_000;
    private const int RetryDelayMs = 2_000;
    private const int HeartbeatSeconds = 15;

    private readonly string _host;
    private readonly ushort[] _ports;
    private readonly ITunnelLogger _log;
    private readonly object _lock = new();
    private readonly CancellationTokenSource _cts = new();

    private int _portIndex;
    private ushort? _lastGoodPort;

    private Socket? _udp;
    private Socket? _tcp;
    private bool _running;
    private IPEndPoint? _peer;

    private Task? _readTask;
    private Task? _writeTask;
    private Task? _heartbeatTask;

    private int _sentFrames;
    private long _sentBytes;
    private int _receivedFrames;
    private long _receivedBytes;
    private int _udpDroppedNoLink;

    public WgRelayClient(string host, IReadOnlyList<ushort> ports, ITunnelLogger log, string? transportId = null)
    {
        _host = host ?? throw new ArgumentNullException(nameof(host));
        _ports = ports is { Count: > 0 } ? ports.ToArray() : new ushort[] { 9444 };
        _log = log ?? throw new ArgumentNullException(nameof(log));
        TransportId = transportId ?? "tcp";
    }

    public string TransportId { get; }

    public ushort LocalPort { get; private set; }

    /// <summary>True khi link TCP tới relay đã thiết lập.</summary>
    public bool IsConnected
    {
        get
        {
            lock (_lock)
            {
                return _tcp is not null;
            }
        }
    }

    /// <summary>
    /// Mở listener UDP local và bắt đầu link TCP.
    /// Trả về cổng UDP local mà WireGuard phải trỏ tới.
    /// </summary>
    public ushort Start()
    {
        Socket udp;
        try
        {
            udp = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            udp.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        }
        catch (SocketException ex)
        {
            throw new WireGuardConfigException($"relay socket error: {ex.Message}");
        }

        LocalPort = (ushort)((IPEndPoint)udp.LocalEndPoint!).Port;

        lock (_lock)
        {
            _udp = udp;
            _running = true;
        }

        _readTask = Task.Run(ReadLoopAsync);
        _writeTask = Task.Run(WriteLoop);
        _heartbeatTask = Task.Run(HeartbeatLoopAsync);

        _log.Info($"relay: local udp listener 127.0.0.1:{LocalPort} -> {_host}:[{string.Join(",", _ports)}]");
        return LocalPort;
    }

    public void Stop()
    {
        lock (_lock)
        {
            if (!_running)
            {
                return;
            }
            _running = false;
        }

        _cts.Cancel();

        Socket? tcp;
        Socket? udp;
        lock (_lock)
        {
            tcp = _tcp;
            _tcp = null;
            udp = _udp;
            _udp = null;
        }

        CloseQuietly(tcp);
        CloseQuietly(udp);
        _log.Info("relay: stopped");
    }

    public string CountersSummary()
    {
        lock (_lock)
        {
            var tcpFd = _tcp is null ? -1 : _tcp.Handle.ToInt64();
            return $"udpFrames={_sentFrames} udpBytes={_sentBytes} " +
                   $"framesFromRelay={_receivedFrames} bytesFromRelay={_receivedBytes} " +
                   $"droppedNoLink={_udpDroppedNoLink} tcpFd={tcpFd}";
        }
    }

    // MARK: - TCP link

    /// <summary>Kết nối tới relay, thử lại chừng nào tunnel còn bật.</summary>
    private async Task<Socket?> ConnectTcpAsync(CancellationToken token)
    {
        while (IsRunning)
        {
            Socket socket;
            try
            {
                socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
            }
            catch (SocketException ex)
            {
                _log.Error($"relay: tcp socket error: {ex.Message}");
                return null;
            }

            ushort port;
            lock (_lock)
            {
                port = _lastGoodPort ?? _ports[_portIndex % _ports.Length];
                if (_lastGoodPort is null)
                {
                    _portIndex++;
                }
            }

            IPAddress? address;
            try
            {
                address = await ResolveAsync(_host, token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _log.Error($"relay: cannot resolve {_host}: {ex.Message}");
                socket.Dispose();
                await DelayAsync(RetryDelayMs, token).ConfigureAwait(false);
                continue;
            }

            if (address is null)
            {
                _log.Error($"relay: cannot resolve {_host}");
                socket.Dispose();
                await DelayAsync(RetryDelayMs, token).ConfigureAwait(false);
                continue;
            }

            var started = Stopwatch.StartNew();
            var connected = false;
            var failureReason = string.Empty;
            try
            {
                using var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                connectTimeout.CancelAfter(ConnectTimeoutMs);
                await socket.ConnectAsync(new IPEndPoint(address, port), connectTimeout.Token).ConfigureAwait(false);
                connected = true;
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested)
            {
                // Lý do hỏng ghi RÕ, không dùng lại errno: đây là hết hạn 10s chờ
                // connect hoàn tất, không phải lỗi mạng cụ thể (bài học ở
                // WGRelayClient.swift:168-189).
                failureReason = $"hết hạn {ConnectTimeoutMs / 1000}s chờ connect hoàn tất";
            }
            catch (Exception ex)
            {
                failureReason = ex.Message;
            }

            if (!connected)
            {
                _log.Info($"relay: connect {_host}:{port} failed: {failureReason}");
                socket.Dispose();
                await DelayAsync(RetryDelayMs, token).ConfigureAwait(false);
                continue;
            }

            try
            {
                socket.NoDelay = true;
            }
            catch (SocketException)
            {
                // Không bật được TCP_NODELAY không phải lỗi chí mạng.
            }

            lock (_lock)
            {
                _lastGoodPort = port;
            }
            _log.Info($"relay: connected to {_host}:{port} in {started.ElapsedMilliseconds}ms");
            return socket;
        }

        return null;
    }

    /// <summary>Đọc frame độ dài tiền tố và giao từng payload cho WireGuard dưới dạng datagram.</summary>
    private async Task ReadLoopAsync()
    {
        var token = _cts.Token;
        while (IsRunning)
        {
            var socket = await ConnectTcpAsync(token).ConfigureAwait(false);
            if (socket is null)
            {
                return;
            }

            lock (_lock)
            {
                _tcp = socket;
            }

            var header = new byte[2];
            while (IsRunning)
            {
                if (!ReadExactly(socket, header, 2))
                {
                    break;
                }
                var frameLength = (header[0] << 8) | header[1];
                if (frameLength <= 0 || frameLength > MaxDatagramBytes)
                {
                    continue;
                }
                var payload = new byte[frameLength];
                if (!ReadExactly(socket, payload, frameLength))
                {
                    break;
                }
                lock (_lock)
                {
                    _receivedFrames++;
                    _receivedBytes += frameLength;
                }
                SendToWireGuard(payload);
            }

            lock (_lock)
            {
                if (ReferenceEquals(_tcp, socket))
                {
                    _tcp = null;
                }
            }
            CloseQuietly(socket);
            if (IsRunning)
            {
                _log.Info("relay: TCP link dropped, reconnecting");
            }
        }
    }

    /// <summary>Chuyển mọi datagram WireGuard vào link TCP.</summary>
    private void WriteLoop()
    {
        var buffer = new byte[MaxDatagramBytes];
        while (IsRunning)
        {
            Socket? udp;
            lock (_lock)
            {
                udp = _udp;
            }
            if (udp is null)
            {
                Thread.Sleep(200);
                continue;
            }

            EndPoint sender = new IPEndPoint(IPAddress.Any, 0);
            int received;
            try
            {
                received = udp.ReceiveFrom(buffer, ref sender);
            }
            catch (ObjectDisposedException)
            {
                return;
            }
            catch (SocketException)
            {
                if (IsRunning)
                {
                    Thread.Sleep(200);
                }
                continue;
            }

            if (received <= 0)
            {
                continue;
            }

            Socket? tcp;
            lock (_lock)
            {
                _peer = (IPEndPoint)sender;
                tcp = _tcp;
            }

            // Chưa có link: bỏ đi — WireGuard tự gửi lại handshake mỗi 5s.
            if (tcp is null)
            {
                lock (_lock)
                {
                    _udpDroppedNoLink++;
                }
                continue;
            }

            var frame = new byte[received + 2];
            frame[0] = (byte)((received >> 8) & 0xff);
            frame[1] = (byte)(received & 0xff);
            Buffer.BlockCopy(buffer, 0, frame, 2, received);

            lock (_lock)
            {
                _sentFrames++;
                _sentBytes += received;
            }

            if (!WriteAll(tcp, frame))
            {
                // Link hỏng một chiều (NAT khách sạn / relay restart): phá link để
                // read loop reconnect. Không làm vậy thì mọi gói sau bị bỏ âm thầm
                // và tunnel "up" mà không có traffic (WGRelayClient.swift:276-282).
                _log.Info("relay: write to relay failed — dropping link to reconnect");
                DropLink(tcp);
            }
        }
    }

    // MARK: - Socket helpers

    /// <summary>Đóng link hỏng; read loop sẽ nhận ra và reconnect.</summary>
    private void DropLink(Socket socket)
    {
        _log.Info($"relay: dropping TCP link: write failure");
        lock (_lock)
        {
            if (ReferenceEquals(_tcp, socket))
            {
                _tcp = null;
            }
        }
        CloseQuietly(socket);
    }

    private void SendToWireGuard(byte[] payload)
    {
        Socket? udp;
        IPEndPoint? target;
        lock (_lock)
        {
            udp = _udp;
            target = _peer;
        }
        if (udp is null || target is null)
        {
            return;
        }
        try
        {
            udp.SendTo(payload, target);
        }
        catch (SocketException)
        {
            // Best effort.
        }
        catch (ObjectDisposedException)
        {
            // Đang Stop().
        }
    }

    private static bool ReadExactly(Socket socket, byte[] buffer, int count)
    {
        var offset = 0;
        while (offset < count)
        {
            int read;
            try
            {
                read = socket.Receive(buffer, offset, count - offset, SocketFlags.None);
            }
            catch (SocketException)
            {
                return false;
            }
            catch (ObjectDisposedException)
            {
                return false;
            }

            if (read > 0)
            {
                offset += read;
            }
            else if (read == 0)
            {
                return false; // peer closed
            }
        }
        return true;
    }

    private static bool WriteAll(Socket socket, byte[] bytes)
    {
        var offset = 0;
        while (offset < bytes.Length)
        {
            int written;
            try
            {
                written = socket.Send(bytes, offset, bytes.Length - offset, SocketFlags.None);
            }
            catch (SocketException)
            {
                return false;
            }
            catch (ObjectDisposedException)
            {
                return false;
            }

            if (written > 0)
            {
                offset += written;
            }
            else
            {
                return false;
            }
        }
        return true;
    }

    private static async Task<IPAddress?> ResolveAsync(string host, CancellationToken token)
    {
        if (IPAddress.TryParse(host, out var literal))
        {
            return literal.AddressFamily == AddressFamily.InterNetwork ? literal : null;
        }

        var addresses = await Dns.GetHostAddressesAsync(host).ConfigureAwait(false);
        foreach (var address in addresses)
        {
            if (address.AddressFamily == AddressFamily.InterNetwork)
            {
                return address;
            }
        }
        return null;
    }

    private static async Task DelayAsync(int milliseconds, CancellationToken token)
    {
        try
        {
            await Task.Delay(milliseconds, token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Stop().
        }
    }

    private async Task HeartbeatLoopAsync()
    {
        var token = _cts.Token;
        try
        {
            while (IsRunning)
            {
                await Task.Delay(TimeSpan.FromSeconds(HeartbeatSeconds), token).ConfigureAwait(false);
                if (!IsRunning)
                {
                    return;
                }
                _log.Info($"relay: heartbeat {CountersSummary()}");
            }
        }
        catch (OperationCanceledException)
        {
            // Stop().
        }
    }

    private bool IsRunning
    {
        get
        {
            lock (_lock)
            {
                return _running;
            }
        }
    }

    private static void CloseQuietly(Socket? socket)
    {
        if (socket is null)
        {
            return;
        }
        try
        {
            socket.Shutdown(SocketShutdown.Both);
        }
        catch (Exception)
        {
            // Socket có thể chưa connect; bỏ qua.
        }
        try
        {
            socket.Close();
        }
        catch (Exception)
        {
            // Best effort.
        }
    }

    public void Dispose()
    {
        Stop();
        _cts.Dispose();
    }
}
