param(
  [Parameter(Mandatory = $true)][string]$Responder,
  [Parameter(Mandatory = $true)][string]$Target,
  [int]$Port = 443,
  [int]$IfIndex = 17,
  [int]$Count = 15,
  [int]$GapMs = 400,
  [int]$TimeoutMs = 4000,
  [string]$Repo = '.'
)

# Đo ĐỘ ỔN ĐỊNH đường vật lý (không qua tunnel) tới một node WireGuard: N lần bắt tay thật,
# đếm tỉ lệ thành công + RTT. Dùng IP_UNICAST_IF để ép gói ra card Wi-Fi.
$script = Join-Path $Repo 'ops/_scratch/T-20260930-03/wg-handshake.mjs'
$ok = 0
$rtts = New-Object System.Collections.Generic.List[double]
$fails = 0

for ($i = 1; $i -le $Count; $i++) {
  $hex = ((& node $script --endpoint "$Target`:$Port" --responder $Responder --hex 2>&1) | Select-String '^HEX ').ToString().Split(' ')[1]
  if (-not $hex) { Write-Output "lan $i : khong tao duoc goi"; $fails++; continue }
  $bytes = [byte[]]::new($hex.Length / 2)
  for ($j = 0; $j -lt $bytes.Length; $j++) { $bytes[$j] = [Convert]::ToByte($hex.Substring($j * 2, 2), 16) }

  $udp = New-Object System.Net.Sockets.UdpClient
  $udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)))
  $udp.Client.ReceiveTimeout = $TimeoutMs
  $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::IP, [System.Net.Sockets.SocketOptionName]31, [byte[]]@(0, 0, 0, [byte]($IfIndex -band 0xff)))

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  [void]$udp.Send($bytes, $bytes.Length, $Target, $Port)
  try {
    $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    $resp = $udp.Receive([ref]$remote)
    $sw.Stop()
    if ($resp.Length -eq 92 -and $resp[0] -eq 2) {
      $ok++
      $rtts.Add($sw.Elapsed.TotalMilliseconds)
      Write-Output ("lan {0,2}: OK  {1,7:N1} ms  (type=2, {2} byte)" -f $i, $sw.Elapsed.TotalMilliseconds, $resp.Length)
    } else {
      $fails++
      Write-Output ("lan {0,2}: goi la type={1} len={2}" -f $i, $resp[0], $resp.Length)
    }
  } catch {
    $sw.Stop()
    $fails++
    Write-Output ("lan {0,2}: KHONG phan hoi sau {1} ms" -f $i, $TimeoutMs)
  }
  $udp.Close()
  Start-Sleep -Milliseconds $GapMs
}

$summary = "TONG KET {0}:{1} -> thanh cong {2}/{3} ({4:N0}%)" -f $Target, $Port, $ok, $Count, (100 * $ok / $Count)
if ($rtts.Count -gt 0) {
  $sorted = $rtts | Sort-Object
  $avg = ($rtts | Measure-Object -Average).Average
  $min = $sorted[0]
  $max = $sorted[$sorted.Count - 1]
  $p90 = $sorted[[Math]::Min($sorted.Count - 1, [int][Math]::Floor(0.9 * $sorted.Count))]
  $summary += ("; RTT min/avg/p90/max = {0:N1}/{1:N1}/{2:N1}/{3:N1} ms" -f $min, $avg, $p90, $max)
}
Write-Output $summary
