# FlowGpt - send a Telegram report from Windows WITHOUT breaking Vietnamese.
#
#   powershell -File ops\send-telegram.ps1 -MessageFile ops\messages\round4-fixed.txt
#
# Why this script exists: `Get-Content -Raw` on Windows PowerShell 5.1 decodes a
# UTF-8 file with the ANSI codepage, so every Vietnamese diacritic was destroyed
# before sending ("xong dot lon" -> "xong A..."). Here we:
#   1. read the message file with explicit UTF-8,
#   2. rewrite it as UTF-8 without BOM and LF endings,
#   3. base64 the FILE BYTES (never a re-encoded string),
#   4. verify the base64 round-trips byte-for-byte locally,
#   5. let Python on the server send it and compare what Telegram echoes back.
#
# This file is intentionally ASCII-only: PowerShell 5.1 reads .ps1 scripts with the
# ANSI codepage too, so non-ASCII here would corrupt the script itself.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$MessageFile,
  [string]$TargetHost = "165.101.114.162",
  [string]$RemoteAppDir = "/opt/flowgpt"
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $MessageFile)) { throw "Message file not found: $MessageFile" }
$resolved = (Resolve-Path $MessageFile).Path

# 1 + 2. Explicit UTF-8 read (NOT Get-Content), then normalise newlines.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($resolved, [System.Text.Encoding]::UTF8)
$text = $text.TrimStart([char]0xFEFF) -replace "`r`n", "`n" -replace "`r", "`n"
$text = $text.TrimEnd() + "`n"

$tmp = Join-Path $env:TEMP "flowgpt-telegram.txt"
[System.IO.File]::WriteAllText($tmp, $text, $utf8)

# 3. base64 of the normalised file's bytes.
$payload = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($tmp))

# 4. Local round-trip check before touching the network.
$bytes = [System.IO.File]::ReadAllBytes($tmp)
$roundTrip = [Convert]::FromBase64String($payload)
$same = $roundTrip.Length -eq $bytes.Length
if ($same) {
  for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($roundTrip[$i] -ne $bytes[$i]) { $same = $false; break }
  }
}

Write-Host "==> Telegram report" -ForegroundColor Cyan
Write-Host "    file      : $resolved"
Write-Host "    chars     : $($text.Length) | bytes: $($bytes.Length) | base64 round-trip ok: $same"
$preview = ($text -split "`n" | Select-Object -First 1)
Write-Host "    preview   : $preview" -ForegroundColor DarkGray
if (-not $same) { throw "base64 does not round-trip - refusing to send" }

# 5. Ship the bytes and let the server-side sender verify what Telegram returns.
$remote = "echo $payload | base64 -d > /tmp/flowgpt-telegram.txt; cd $RemoteAppDir; python3 ops/send-telegram.py /tmp/flowgpt-telegram.txt; rm -f /tmp/flowgpt-telegram.txt"
$output = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 "root@$TargetHost" $remote
$code = $LASTEXITCODE
$output | ForEach-Object { Write-Host "    $_" }
if ($code -ne 0) { throw "Telegram send failed (exit $code)" }
Write-Host "    done" -ForegroundColor Green
