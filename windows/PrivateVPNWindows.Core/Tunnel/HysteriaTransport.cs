using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Tham số cho transport Hysteria2.
///
/// Port từ nhánh Hysteria của Android (android/.../vpn/HysteriaVpnService.kt:1044-1087)
/// và Config.kt:96-122. Password/obfs KHÔNG có giá trị mặc định: chúng là credential
/// (dù đã lộ trong APK — Config.kt:117-122), nên phải do tầng gọi truyền vào, không
/// hard-code thêm chỗ khác (AGENTS.md §1).
/// </summary>
public sealed class HysteriaOptions
{
    /// <summary>Host hysteria server (= host của exit node), mirror Config.HY_SERVER.</summary>
    public required string ServerHost { get; init; }

    /// <summary>Cổng UDP hysteria; Android thử 8443/28443/54443 (Config.kt:102).</summary>
    public ushort ServerPort { get; init; } = 8443;

    /// <summary>Auth password của hysteria2 (Config.HY_PASSWORD).</summary>
    public required string Password { get; init; }

    /// <summary>Obfs salamander password (Config.HY_OBFS); rỗng = không obfs.</summary>
    public string? ObfsPassword { get; init; }

    /// <summary>Brutal CC up/down (kbps); 0 = CC mặc định. Mirror HY_UP_KBPS/HY_DOWN_KBPS.</summary>
    public int UpKbps { get; init; } = 2000;

    public int DownKbps { get; init; } = 20000;

    /// <summary>TLS SNI; null = dùng ServerHost (mobile.go:161 set ServerName = host).</summary>
    public string? Sni { get; init; }

    /// <summary>
    /// Node dùng self-signed cert (provision-node.sh:88-96), client Android bỏ qua
    /// xác thực chứng chỉ (mobile.go:160-163). Giữ true cho tới khi node có cert thật.
    /// </summary>
    public bool Insecure { get; init; } = true;

    /// <summary>
    /// Đích UDP mà hysteria server phải forward tới. Hysteria server chạy CÙNG host với
    /// WireGuard trên node, nên mặc định loopback:127.0.0.1:443 — đúng như relay UDP 443
    /// mà WSRelayClient.swift:10-13 mô tả.
    /// </summary>
    public string TargetHost { get; init; } = "127.0.0.1";

    public ushort TargetPort { get; init; } = 443;

    /// <summary>Đường dẫn hysteria.exe; null = tự dò (xem <see cref="HysteriaTransport.ResolveExecutable"/>).</summary>
    public string? ExecutablePath { get; init; }

    /// <summary>Thời gian chờ SOCKS5 listener mở sau khi spawn process.</summary>
    public int StartupTimeoutMs { get; init; } = 6_000;

    /// <summary>Brutal thấp hơn cho đường WS relay (Config.kt:115-116), nếu tầng gọi muốn.</summary>
    public HysteriaOptions WithRelayBandwidth(int upKbps, int downKbps)
    {
        return new HysteriaOptions
        {
            ServerHost = ServerHost,
            ServerPort = ServerPort,
            Password = Password,
            ObfsPassword = ObfsPassword,
            UpKbps = upKbps,
            DownKbps = downKbps,
            Sni = Sni,
            Insecure = Insecure,
            TargetHost = TargetHost,
            TargetPort = TargetPort,
            ExecutablePath = ExecutablePath,
            StartupTimeoutMs = StartupTimeoutMs,
        };
    }
}

/// <summary>
/// Transport Hysteria2: chạy <c>hysteria.exe</c> (đóng gói kèm app) ở chế độ client
/// SOCKS5 có UDP, rồi bắc cầu gói WireGuard UDP qua SOCKS5 UDP ASSOCIATE tới cổng
/// UDP của node.
///
/// ⚠️ LỆCH SO VỚI CODE ANDROID — bắt buộc đọc:
/// Android KHÔNG dùng SOCKS5. <c>HysteriaVpnService.kt</c> đưa thẳng TUN fd của
/// VpnService vào client Go (<c>Mobile.serve</c>, HysteriaVpnService.kt:530/582), tức
/// hysteria2 LÀ tunnel (protocol riêng của nó), chứ không phải lớp chở WireGuard.
/// Android cũng không bridge gì: outer socket (UDP/TCP relay/WS) do Java tạo rồi đưa
/// fd vào Go (mobile.go:155-220).
///
/// Task Windows yêu cầu giữ WireGuard làm tunnel và chở gói WireGuard qua Hysteria,
/// nên ở đây dùng đúng cách brief mô tả: hysteria.exe làm SOCKS5 proxy có UDP
/// (hysteria2 client có sẵn chế độ này), WireGuard trỏ vào listener local của lớp
/// này, và mỗi datagram được gửi qua SOCKS5 UDP ASSOCIATE tới đích UDP của node.
/// Đây là ADAPTATION, không phải bản port 1:1 của HysteriaVpnService.kt.
///
/// Phần chạy được trên macOS: dựng config, spawn process, SOCKS5 handshake, framing.
/// Phần CHỈ kiểm chứng được trên Windows/thiết bị thật: hysteria.exe có tồn tại và
/// chấp nhận config này không; hysteria server có cho forward UDP tới 127.0.0.1:443 không.
/// </summary>
public sealed class HysteriaTransport : ITunnelTransport
{
    private const int MaxDatagramBytes = 65_535;
    private const int SocksConnectRetryMs = 200;
    private const int HeartbeatSeconds = 15;

    private readonly HysteriaOptions _options;
    private readonly ITunnelLogger _log;
    private readonly object _lock = new();
    private readonly CancellationTokenSource _cts = new();

    private Process? _process;
    private string? _configPath;
    private TcpClient? _control;
    private NetworkStream? _controlStream;
    private Socket? _wgSocket;
    private Socket? _socksSocket;
    private IPEndPoint? _socksRelay;
    private IPEndPoint? _peer;
    private byte[]? _targetHeader;
    private bool _running;

    private Task? _wgToSocksTask;
    private Task? _socksToWgTask;
    private Task? _controlWatchTask;
    private Task? _stderrTask;
    private Task? _heartbeatTask;

    private int _sentFrames;
    private long _sentBytes;
    private int _receivedFrames;
    private long _receivedBytes;
    private int _droppedNoLink;

    public HysteriaTransport(HysteriaOptions options, ITunnelLogger log, string transportId = "hy")
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _log = log ?? throw new ArgumentNullException(nameof(log));
        TransportId = transportId;
    }

    public string TransportId { get; }

    public ushort LocalPort { get; private set; }

    public bool IsConnected
    {
        get
        {
            lock (_lock)
            {
                return _running
                       && _process is { HasExited: false }
                       && _socksRelay is not null;
            }
        }
    }

    /// <summary>Dò hysteria.exe: cạnh app, thư mục con <c>hysteria</c>, rồi PATH.</summary>
    public static string? ResolveExecutable()
    {
        var names = OperatingSystem.IsWindows()
            ? new[] { "hysteria.exe" }
            : new[] { "hysteria", "hysteria.exe" };

        var directories = new List<string> { AppContext.BaseDirectory, Path.Combine(AppContext.BaseDirectory, "hysteria") };
        directories.AddRange((Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries));

        foreach (var directory in directories)
        {
            foreach (var name in names)
            {
                var candidate = Path.Combine(directory.Trim(), name);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
        }

        return null;
    }

    public ushort Start()
    {
        if (string.IsNullOrWhiteSpace(_options.ServerHost))
        {
            throw new WireGuardConfigException("Hysteria ServerHost is required.");
        }
        if (string.IsNullOrWhiteSpace(_options.Password))
        {
            throw new WireGuardConfigException("Hysteria Password is required.");
        }

        var exe = string.IsNullOrWhiteSpace(_options.ExecutablePath)
            ? ResolveExecutable()
            : _options.ExecutablePath;
        if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
        {
            throw new WireGuardConfigException(
                "hysteria executable not found. Bundle hysteria.exe next to the app or set ExecutablePath.");
        }

        var socksPort = PickFreeTcpPort();

        // Socket hướng WireGuard: đây là cổng mà wireguard.exe phải trỏ tới.
        var wgSocket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        wgSocket.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        LocalPort = (ushort)((IPEndPoint)wgSocket.LocalEndPoint!).Port;

        // Socket hướng SOCKS5: gửi/nhận datagram đã bọc header SOCKS5.
        var socksSocket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        socksSocket.Bind(new IPEndPoint(IPAddress.Loopback, 0));

        lock (_lock)
        {
            _wgSocket = wgSocket;
            _socksSocket = socksSocket;
            _running = true;
        }

        try
        {
            _targetHeader = BuildSocks5UdpHeader(_options.TargetHost, _options.TargetPort);
            _configPath = WriteConfigFile(socksPort);
            StartProcess(exe, _configPath);
            EstablishSocks5Association(socksPort);
        }
        catch
        {
            Stop();
            throw;
        }

        _log.Info(
            $"hy: local udp listener 127.0.0.1:{LocalPort} -> hysteria socks 127.0.0.1:{socksPort} " +
            $"-> {_options.ServerHost}:{_options.ServerPort} -> udp {_options.TargetHost}:{_options.TargetPort}");

        _wgToSocksTask = Task.Run(WireGuardToSocksLoop);
        _socksToWgTask = Task.Run(SocksToWireGuardLoop);
        _controlWatchTask = Task.Run(ControlWatchLoop);
        _heartbeatTask = Task.Run(HeartbeatLoopAsync);

        return LocalPort;
    }

    public void Stop()
    {
        lock (_lock)
        {
            if (!_running && _process is null)
            {
                return;
            }
            _running = false;
        }

        _cts.Cancel();

        Process? process;
        TcpClient? control;
        Socket? wg;
        Socket? socks;
        string? config;
        lock (_lock)
        {
            process = _process;
            _process = null;
            control = _control;
            _control = null;
            _controlStream = null;
            wg = _wgSocket;
            _wgSocket = null;
            socks = _socksSocket;
            _socksSocket = null;
            _socksRelay = null;
            config = _configPath;
            _configPath = null;
        }

        try
        {
            control?.Close();
        }
        catch (Exception)
        {
            // Best effort.
        }
        CloseQuietly(wg);
        CloseQuietly(socks);

        if (process is { HasExited: false })
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (Exception ex)
            {
                _log.Warn($"hy: kill hysteria failed: {ex.Message}");
            }
        }
        process?.Dispose();

        if (!string.IsNullOrWhiteSpace(config))
        {
            try
            {
                File.Delete(config);
            }
            catch (Exception)
            {
                // File tạm có thể đã bị xoá; bỏ qua.
            }
        }

        _log.Info("hy: stopped");
    }

    public string CountersSummary()
    {
        lock (_lock)
        {
            var alive = _process is { HasExited: false };
            return $"udpFrames={_sentFrames} udpBytes={_sentBytes} " +
                   $"framesFromRelay={_receivedFrames} bytesFromRelay={_receivedBytes} " +
                   $"droppedNoLink={_droppedNoLink} processAlive={alive}";
        }
    }

    // MARK: - process + config

    private string WriteConfigFile(int socksPort)
    {
        var sb = new StringBuilder();
        sb.Append("server: ").Append(YamlQuote($"{FormatHost(_options.ServerHost)}:{_options.ServerPort}")).Append('\n');
        sb.Append("auth: ").Append(YamlQuote(_options.Password)).Append('\n');
        sb.Append("tls:\n");
        sb.Append("  sni: ").Append(YamlQuote(_options.Sni ?? _options.ServerHost)).Append('\n');
        sb.Append("  insecure: ").Append(_options.Insecure ? "true" : "false").Append('\n');
        if (!string.IsNullOrWhiteSpace(_options.ObfsPassword))
        {
            sb.Append("obfs:\n");
            sb.Append("  type: salamander\n");
            sb.Append("  salamander:\n");
            sb.Append("    password: ").Append(YamlQuote(_options.ObfsPassword)).Append('\n');
        }
        if (_options.UpKbps > 0 || _options.DownKbps > 0)
        {
            sb.Append("bandwidth:\n");
            sb.Append("  up: ").Append(_options.UpKbps.ToString(CultureInfo.InvariantCulture)).Append(" kbps\n");
            sb.Append("  down: ").Append(_options.DownKbps.ToString(CultureInfo.InvariantCulture)).Append(" kbps\n");
        }
        sb.Append("socks5:\n");
        sb.Append("  listen: 127.0.0.1:").Append(socksPort.ToString(CultureInfo.InvariantCulture)).Append('\n');

        var path = Path.Combine(Path.GetTempPath(), $"vpnflow-hysteria-{Guid.NewGuid():N}.yaml");
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        return path;
    }

    private void StartProcess(string exe, string configPath)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = $"client -c \"{configPath}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        var process = new Process { StartInfo = startInfo };
        process.Start();
        lock (_lock)
        {
            _process = process;
        }

        _stderrTask = Task.Run(async () =>
        {
            try
            {
                string? line;
                while ((line = await process.StandardError.ReadLineAsync().ConfigureAwait(false)) is not null)
                {
                    _log.Warn($"hy[stderr]: {line}");
                }
            }
            catch (Exception)
            {
                // Process đã đóng.
            }
        });

        _ = Task.Run(async () =>
        {
            try
            {
                string? line;
                while ((line = await process.StandardOutput.ReadLineAsync().ConfigureAwait(false)) is not null)
                {
                    _log.Info($"hy[stdout]: {line}");
                }
            }
            catch (Exception)
            {
                // Process đã đóng.
            }
        });
    }

    // MARK: - SOCKS5

    /// <summary>Chờ SOCKS5 listener mở rồi thực hiện greeting + UDP ASSOCIATE.</summary>
    private void EstablishSocks5Association(int socksPort)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(_options.StartupTimeoutMs);
        TcpClient? control = null;
        Exception? lastError = null;

        while (DateTime.UtcNow < deadline)
        {
            if (_process is { HasExited: true })
            {
                throw new WireGuardConfigException(
                    $"hysteria exited during startup (exit code {_process.ExitCode}).");
            }

            try
            {
                var candidate = new TcpClient();
                candidate.Connect(IPAddress.Loopback, socksPort);
                control = candidate;
                break;
            }
            catch (Exception ex)
            {
                lastError = ex;
                control?.Dispose();
                control = null;
                Thread.Sleep(SocksConnectRetryMs);
            }
        }

        if (control is null)
        {
            throw new WireGuardConfigException(
                $"hysteria SOCKS5 listener did not open on 127.0.0.1:{socksPort} " +
                $"within {_options.StartupTimeoutMs}ms ({lastError?.Message}).");
        }

        control.NoDelay = true;
        var stream = control.GetStream();

        // Greeting: version 5, 1 method, no-auth.
        stream.Write(new byte[] { 0x05, 0x01, 0x00 }, 0, 3);
        var greeting = ReadExactly(stream, 2);
        if (greeting[0] != 0x05 || greeting[1] != 0x00)
        {
            control.Dispose();
            throw new WireGuardConfigException(
                $"hysteria SOCKS5 refused no-auth greeting (method 0x{greeting[1]:x2}).");
        }

        // UDP ASSOCIATE với DST 0.0.0.0:0 — để server tự chọn relay endpoint.
        stream.Write(new byte[] { 0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0 }, 0, 10);
        var reply = ReadSocks5Reply(stream);
        if (reply.Reply != 0x00)
        {
            control.Dispose();
            throw new WireGuardConfigException($"hysteria SOCKS5 UDP ASSOCIATE failed (reply 0x{reply.Reply:x2}).");
        }

        lock (_lock)
        {
            _control = control;
            _controlStream = stream;
            // BND.ADDR thường là 127.0.0.1; nếu server trả 0.0.0.0 thì dùng loopback.
            _socksRelay = reply.BoundAddress is null || reply.BoundAddress.Equals(IPAddress.Any)
                ? new IPEndPoint(IPAddress.Loopback, reply.BoundPort)
                : new IPEndPoint(reply.BoundAddress, reply.BoundPort);
        }
    }

    private readonly record struct Socks5Reply(byte Reply, IPAddress? BoundAddress, int BoundPort);

    private static Socks5Reply ReadSocks5Reply(NetworkStream stream)
    {
        var head = ReadExactly(stream, 4);
        if (head[0] != 0x05)
        {
            throw new WireGuardConfigException($"hysteria SOCKS5 bad version 0x{head[0]:x2}.");
        }

        IPAddress? address = head[3] switch
        {
            0x01 => new IPAddress(ReadExactly(stream, 4)),
            0x04 => new IPAddress(ReadExactly(stream, 16)),
            0x03 => ReadDomain(stream),
            _ => throw new WireGuardConfigException($"hysteria SOCKS5 bad address type 0x{head[3]:x2}."),
        };
        var portBytes = ReadExactly(stream, 2);
        var port = (portBytes[0] << 8) | portBytes[1];
        return new Socks5Reply(head[1], address, port);
    }

    private static IPAddress ReadDomain(NetworkStream stream)
    {
        var length = ReadExactly(stream, 1)[0];
        var domain = Encoding.ASCII.GetString(ReadExactly(stream, length));
        return IPAddress.TryParse(domain, out var ip) ? ip : IPAddress.Loopback;
    }

    private static byte[] ReadExactly(NetworkStream stream, int count)
    {
        var buffer = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = stream.Read(buffer, offset, count - offset);
            if (read <= 0)
            {
                throw new WireGuardConfigException("hysteria SOCKS5 control connection closed.");
            }
            offset += read;
        }
        return buffer;
    }

    // MARK: - bridging

    /// <summary>WireGuard → SOCKS5 UDP: bọc header đích rồi gửi tới relay endpoint.</summary>
    private void WireGuardToSocksLoop()
    {
        var buffer = new byte[MaxDatagramBytes];
        while (IsRunning)
        {
            Socket? wg;
            IPEndPoint? relay;
            byte[]? header;
            lock (_lock)
            {
                wg = _wgSocket;
                relay = _socksRelay;
                header = _targetHeader;
            }
            if (wg is null || relay is null || header is null)
            {
                Thread.Sleep(200);
                continue;
            }

            EndPoint sender = new IPEndPoint(IPAddress.Any, 0);
            int received;
            try
            {
                received = wg.ReceiveFrom(buffer, ref sender);
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

            var datagram = new byte[header.Length + received];
            Buffer.BlockCopy(header, 0, datagram, 0, header.Length);
            Buffer.BlockCopy(buffer, 0, datagram, header.Length, received);

            Socket? socks;
            lock (_lock)
            {
                socks = _socksSocket;
            }
            if (socks is null)
            {
                continue;
            }

            try
            {
                socks.SendTo(datagram, relay);
                lock (_lock)
                {
                    _sentFrames++;
                    _sentBytes += received;
                }
            }
            catch (SocketException)
            {
                lock (_lock)
                {
                    _droppedNoLink++;
                }
            }
            catch (ObjectDisposedException)
            {
                return;
            }
        }
    }

    /// <summary>SOCKS5 UDP → WireGuard: bỏ header, gửi về peer đã nhớ.</summary>
    private void SocksToWireGuardLoop()
    {
        var buffer = new byte[MaxDatagramBytes];
        while (IsRunning)
        {
            Socket? socks;
            lock (_lock)
            {
                socks = _socksSocket;
            }
            if (socks is null)
            {
                Thread.Sleep(200);
                continue;
            }

            EndPoint sender = new IPEndPoint(IPAddress.Any, 0);
            int received;
            try
            {
                received = socks.ReceiveFrom(buffer, ref sender);
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

            // Header SOCKS5 UDP: RSV(2) FRAG(1) ATYP(1) ADDR(variable) PORT(2).
            if (received < 4 || buffer[0] != 0x00 || buffer[1] != 0x00)
            {
                continue;
            }
            var offset = 4;
            switch (buffer[3])
            {
                case 0x01:
                    offset += 4;
                    break;
                case 0x04:
                    offset += 16;
                    break;
                case 0x03:
                    if (received < 5)
                    {
                        continue;
                    }
                    offset += 1 + buffer[4];
                    break;
                default:
                    continue;
            }
            offset += 2; // port
            if (offset >= received)
            {
                continue;
            }

            var payload = new byte[received - offset];
            Buffer.BlockCopy(buffer, offset, payload, 0, payload.Length);
            lock (_lock)
            {
                _receivedFrames++;
                _receivedBytes += payload.Length;
            }
            SendToWireGuard(payload);
        }
    }

    private void SendToWireGuard(byte[] payload)
    {
        Socket? wg;
        IPEndPoint? target;
        lock (_lock)
        {
            wg = _wgSocket;
            target = _peer;
        }
        if (wg is null || target is null)
        {
            return;
        }
        try
        {
            wg.SendTo(payload, target);
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

    /// <summary>Theo dõi control connection; nó đóng nghĩa là UDP association chết.</summary>
    private void ControlWatchLoop()
    {
        NetworkStream? stream;
        lock (_lock)
        {
            stream = _controlStream;
        }
        if (stream is null)
        {
            return;
        }

        var buffer = new byte[1];
        try
        {
            while (IsRunning && stream.Read(buffer, 0, 1) > 0)
            {
                // SOCKS5 không gửi dữ liệu trên control connection cho UDP ASSOCIATE.
            }
        }
        catch (Exception)
        {
            // Đóng/Stop().
        }

        if (IsRunning)
        {
            _log.Warn("hy: SOCKS5 control connection closed — UDP association is dead");
            lock (_lock)
            {
                _socksRelay = null;
            }
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
                _log.Info($"hy: heartbeat {CountersSummary()}");
            }
        }
        catch (OperationCanceledException)
        {
            // Stop().
        }
    }

    // MARK: - helpers

    private static int PickFreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    /// <summary>Header SOCKS5 UDP cho một đích cố định: RSV RSV FRAG ATYP ADDR PORT.</summary>
    internal static byte[] BuildSocks5UdpHeader(string host, int port)
    {
        var addressBytes = new List<byte> { 0x00, 0x00, 0x00 };
        if (IPAddress.TryParse(host, out var ip))
        {
            if (ip.AddressFamily == AddressFamily.InterNetwork)
            {
                addressBytes.Add(0x01);
                addressBytes.AddRange(ip.GetAddressBytes());
            }
            else
            {
                addressBytes.Add(0x04);
                addressBytes.AddRange(ip.GetAddressBytes());
            }
        }
        else
        {
            var domain = Encoding.ASCII.GetBytes(host);
            if (domain.Length > 255)
            {
                throw new WireGuardConfigException("Hysteria target host is too long.");
            }
            addressBytes.Add(0x03);
            addressBytes.Add((byte)domain.Length);
            addressBytes.AddRange(domain);
        }

        addressBytes.Add((byte)((port >> 8) & 0xff));
        addressBytes.Add((byte)(port & 0xff));
        return addressBytes.ToArray();
    }

    private static string FormatHost(string host)
    {
        return host.Contains(':') && !host.StartsWith('[') ? $"[{host}]" : host;
    }

    private static string YamlQuote(string value)
    {
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
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
