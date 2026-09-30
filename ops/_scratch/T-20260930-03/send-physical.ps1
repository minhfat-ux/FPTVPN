param(
  [Parameter(Mandatory = $true)][string]$Hex,
  [string]$Target = '103.173.155.50',
  [int]$Port = 443,
  [int]$IfIndex = 17,
  [int]$TimeoutMs = 10000,
  [switch]$HostOrder
)

# Gửi gói WireGuard handshake ra ĐÚNG card vật lý (IP_UNICAST_IF = 31) — mô phỏng chế độ udp-direct
# của app Windows, không đi qua tunnel đang bật.
$bytes = [byte[]]::new($Hex.Length / 2)
for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [Convert]::ToByte($Hex.Substring($i * 2, 2), 16) }

$udp = New-Object System.Net.Sockets.UdpClient
$udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)))
$udp.Client.ReceiveTimeout = $TimeoutMs

if ($HostOrder) { $val = [byte[]]@([byte]($IfIndex -band 0xff), 0, 0, 0) }
else { $val = [byte[]]@(0, 0, 0, [byte]($IfIndex -band 0xff)) }
$udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::IP, [System.Net.Sockets.SocketOptionName]31, $val)

Write-Output ("local={0} ifindex={1} order={2} gui toi {3}:{4} ({5} byte)" -f $udp.Client.LocalEndPoint, $IfIndex, $(if ($HostOrder) { 'host' } else { 'network' }), $Target, $Port, $bytes.Length)
[void]$udp.Send($bytes, $bytes.Length, $Target, $Port)

try {
  $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
  $resp = $udp.Receive([ref]$remote)
  $type = $resp[0]
  $receiver = if ($resp.Length -ge 12) { [BitConverter]::ToUInt32($resp, 8) } else { -1 }
  Write-Output ("PHAN HOI: {0} byte tu {1}, type={2}, receiver_index={3}" -f $resp.Length, $remote, $type, $receiver)
} catch {
  Write-Output ("KHONG PHAN HOI sau {0} ms: {1}" -f $TimeoutMs, $_.Exception.Message)
}
$udp.Close()
