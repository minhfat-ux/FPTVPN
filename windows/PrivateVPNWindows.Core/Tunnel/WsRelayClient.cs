using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Threading.Channels;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// WireGuard-over-WebSocket relay client — port trung thực của
/// <c>WSRelayClient.swift</c> (iOS/PrivateVPNPacketTunnel/WSRelayClient.swift:21-431).
///
/// WireGuard được trỏ vào listener UDP local ở đây. Mỗi datagram là MỘT binary
/// WebSocket message (WS giữ nguyên ranh giới message nên không cần framing), gửi
/// tới relay sau Funnel endpoint; relay bung ra UDP tới WireGuard của exit node và
/// trả lời theo đúng đường đó.
///
/// Cổng UDP local bind MỘT lần trong <see cref="Start"/> và không bao giờ đổi:
/// WebSocket reconnect dùng lại đúng listener đó, nên WireGuard không bị cấu hình lại.
///
/// Khác biệt BCL so với bản Swift (không đổi hành vi):
///  - <c>URLSessionWebSocketTask.sendPing</c> → <c>ClientWebSocket.Options.KeepAliveInterval</c>
///    (BCL tự gửi ping và báo lỗi qua receive khi đường chết).
///  - <c>AsyncStream(bufferingNewest:)</c> → <c>Channel</c> bounded với
///    <see cref="BoundedChannelFullMode.DropOldest"/> (đúng ngữ nghĩa buffer mới nhất).
/// </summary>
public sealed class WsRelayClient : ITunnelTransport
{
    /// <summary>Datagram WireGuard giữ lại khi WS đang xuống; có trần để không phình RAM.</summary>
    public const int SendBufferLimit = 256;

    /// <summary>Chu kỳ keepalive, mirror ping 20s của Android (WSRelayBridge.kt:57).</summary>
    public const int PingIntervalSeconds = 20;

    public const int MinBackoffSeconds = 1;
    public const int MaxBackoffSeconds = 15;

    private const int HeartbeatSeconds = 15;
    private const int MaxDatagramBytes = 65_535;

    private readonly Uri _url;
    private readonly ITunnelLogger _log;
    private readonly object _lock = new();

    private readonly Channel<byte[]> _datagrams = Channel.CreateBounded<byte[]>(
        new BoundedChannelOptions(SendBufferLimit)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = true,
        });

    private readonly CancellationTokenSource _cts = new();

    private Socket? _udp;
    private bool _running;
    private IPEndPoint? _peer;
    private ClientWebSocket? _socket;
    private bool _open;
    private bool _openedInThisAttempt;

    private Task? _udpTask;
    private Task? _sendTask;
    private Task? _receiveTask;
    private Task? _heartbeatTask;

    private int _sentFrames;
    private long _sentBytes;
    private int _receivedFrames;
    private long _receivedBytes;
    private int _droppedNoLink;

    public WsRelayClient(Uri url, ITunnelLogger log, string transportId = "ws")
    {
        _url = url ?? throw new ArgumentNullException(nameof(url));
        _log = log ?? throw new ArgumentNullException(nameof(log));
        TransportId = transportId;
    }

    public string TransportId { get; }

    public ushort LocalPort { get; private set; }

    /// <summary>True khi WebSocket tới relay đang mở.</summary>
    public bool IsConnected
    {
        get
        {
            lock (_lock)
            {
                return _open;
            }
        }
    }

    /// <summary>
    /// Mở listener UDP local và bắt đầu link WebSocket.
    /// Trả về cổng UDP local mà WireGuard phải trỏ tới; cổng này giữ nguyên suốt
    /// vòng đời client, kể cả khi WebSocket reconnect.
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
            throw new WireGuardConfigException($"ws relay udp socket error: {ex.Message}");
        }

        LocalPort = (ushort)((IPEndPoint)udp.LocalEndPoint!).Port;

        lock (_lock)
        {
            _udp = udp;
            _running = true;
        }

        _log.Info($"ws-relay: local udp listener 127.0.0.1:{LocalPort} -> {_url}");

        // Link WebSocket tự dựng/tự dựng lại trên task riêng, nên relay tạm không
        // tới được cũng không chặn tunnel khởi động.
        _udpTask = Task.Run(UdpToWebSocketLoop);
        _sendTask = Task.Run(SendLoopAsync);
        _receiveTask = Task.Run(WebSocketLoopAsync);
        _heartbeatTask = Task.Run(HeartbeatLoopAsync);

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
            _open = false;
        }

        _cts.Cancel();
        _datagrams.Writer.TryComplete();

        ClientWebSocket? socket;
        Socket? udp;
        lock (_lock)
        {
            socket = _socket;
            _socket = null;
            udp = _udp;
            _udp = null;
        }

        try
        {
            socket?.Abort();
        }
        catch (Exception)
        {
            // Best effort: abort on an already-closed socket must not throw out of Stop.
        }
        try
        {
            udp?.Close();
        }
        catch (Exception)
        {
            // Best effort.
        }

        _log.Info("ws-relay: stopped");
    }

    public string CountersSummary()
    {
        lock (_lock)
        {
            return $"udpFrames={_sentFrames} udpBytes={_sentBytes} " +
                   $"framesFromRelay={_receivedFrames} bytesFromRelay={_receivedBytes} " +
                   $"droppedNoLink={_droppedNoLink} wsOpen={_open}";
        }
    }

    // MARK: - UDP side

    /// <summary>Chuyển mọi datagram WireGuard vào send loop của WebSocket.</summary>
    private void UdpToWebSocketLoop()
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

            lock (_lock)
            {
                _peer = (IPEndPoint)sender;
            }

            // Bounded queue: khi WebSocket xuống thì datagram cũ bị bỏ thay vì buffer vô hạn.
            var datagram = new byte[received];
            Buffer.BlockCopy(buffer, 0, datagram, 0, received);
            _datagrams.Writer.TryWrite(datagram);
        }
    }

    /// <summary>Ghi datagram nhận từ relay về peer WireGuard đã nhớ.</summary>
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
            // Peer chưa sẵn sàng/đã đổi; datagram tiếp theo sẽ thử lại.
        }
        catch (ObjectDisposedException)
        {
            // Đang Stop().
        }
    }

    // MARK: - WebSocket side

    private async Task SendLoopAsync()
    {
        var token = _cts.Token;
        try
        {
            await foreach (var datagram in _datagrams.Reader.ReadAllAsync(token).ConfigureAwait(false))
            {
                if (!IsRunning)
                {
                    return;
                }

                ClientWebSocket? socket;
                lock (_lock)
                {
                    socket = _socket;
                }

                if (socket is null || !IsConnected)
                {
                    NoteDropped();
                    continue;
                }

                try
                {
                    await socket.SendAsync(
                        new ArraySegment<byte>(datagram),
                        WebSocketMessageType.Binary,
                        endOfMessage: true,
                        token).ConfigureAwait(false);
                    NoteSent(datagram.Length);
                }
                catch (Exception)
                {
                    // Receive loop thấy cùng lỗi và sẽ reconnect.
                    NoteDropped();
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Stop().
        }
    }

    /// <summary>Giữ một WebSocket mở, reconnect với backoff có trần khi vẫn đang chạy.</summary>
    private async Task WebSocketLoopAsync()
    {
        var backoff = MinBackoffSeconds;
        var token = _cts.Token;

        while (IsRunning)
        {
            bool opened;
            try
            {
                opened = await ServeOnceAsync(token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            if (!IsRunning)
            {
                return;
            }

            backoff = opened ? MinBackoffSeconds : Math.Min(backoff * 2, MaxBackoffSeconds);
            _log.Info($"ws-relay: link down, reconnecting in {backoff}s");
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(backoff), token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    /// <summary>
    /// Phục vụ một kết nối WebSocket tới khi đóng/lỗi.
    /// Trả về việc socket có từng mở được hay không, để quyết định backoff.
    /// </summary>
    private async Task<bool> ServeOnceAsync(CancellationToken token)
    {
        using var socket = new ClientWebSocket();
        // BCL thay cho sendPing thủ công của Swift: ping định kỳ làm đường half-open lộ lỗi.
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(PingIntervalSeconds);

        lock (_lock)
        {
            if (!_running)
            {
                return false;
            }
            _socket = socket;
            _open = false;
            _openedInThisAttempt = false;
        }

        try
        {
            await socket.ConnectAsync(_url, token).ConfigureAwait(false);
            lock (_lock)
            {
                _openedInThisAttempt = true;
                _open = true;
            }
            _log.Info($"ws-relay: connected to {_url}");

            var buffer = new byte[MaxDatagramBytes];
            while (IsRunning && socket.State == WebSocketState.Open)
            {
                var message = await ReceiveMessageAsync(socket, buffer, token).ConfigureAwait(false);
                if (message is null)
                {
                    break;
                }
                Handle(message.Value.Type, message.Value.Data);
            }
        }
        catch (OperationCanceledException)
        {
            // Stop().
        }
        catch (Exception ex)
        {
            if (IsRunning)
            {
                _log.Info($"ws-relay: websocket link dropped: {ex.Message}");
            }
        }
        finally
        {
            lock (_lock)
            {
                if (ReferenceEquals(_socket, socket))
                {
                    _socket = null;
                }
                _open = false;
            }
        }

        return OpenedInThisAttempt();
    }

    /// <summary>Gom các frame cho tới EndOfMessage vì một message có thể bị phân mảnh.</summary>
    private static async Task<(WebSocketMessageType Type, byte[] Data)?> ReceiveMessageAsync(
        ClientWebSocket socket,
        byte[] buffer,
        CancellationToken token)
    {
        using var accumulated = new MemoryStream();
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), token).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return null;
            }
            if (result.Count > 0)
            {
                accumulated.Write(buffer, 0, result.Count);
            }
        }
        while (!result.EndOfMessage);

        return (result.MessageType, accumulated.ToArray());
    }

    /// <summary>Một binary message là một datagram: giao thẳng cho WireGuard.</summary>
    private void Handle(WebSocketMessageType type, byte[] data)
    {
        if (type == WebSocketMessageType.Binary)
        {
            lock (_lock)
            {
                _receivedFrames++;
                _receivedBytes += data.Length;
            }
            SendToWireGuard(data);
        }
        else
        {
            _log.Info($"ws-relay: ignoring text frame ({data.Length} bytes)");
        }
    }

    // MARK: - Diagnostics

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
                _log.Info($"ws-relay: heartbeat {CountersSummary()}");
            }
        }
        catch (OperationCanceledException)
        {
            // Stop().
        }
    }

    private void NoteSent(int bytes)
    {
        lock (_lock)
        {
            _sentFrames++;
            _sentBytes += bytes;
        }
    }

    private void NoteDropped()
    {
        lock (_lock)
        {
            _droppedNoLink++;
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

    private bool OpenedInThisAttempt()
    {
        lock (_lock)
        {
            return _openedInThisAttempt;
        }
    }

    public void Dispose()
    {
        Stop();
        _cts.Dispose();
    }
}
