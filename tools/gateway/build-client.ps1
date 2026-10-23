# Build hysteria2 client cho GATEWAY (linux arm64/armv7/amd64) + bản Windows để test.
#
# Vì sao có script này: cùng một source (`C:\Users\Minhn\hy-src`) sinh ra
#   - AAR Android (`tools/hysteria-android/build.sh`), và
#   - binary gateway (script này).
# Không sửa gì trong `mobile.go`: gateway dùng CLI upstream, chỉ khác file cấu hình.
#
# Cách chạy (từ gốc repo):
#   pwsh -File tools/gateway/build-client.ps1
#   pwsh -File tools/gateway/build-client.ps1 -Source D:\hy-src\app -OutDir D:\out
#
# Yêu cầu: Go 1.22+ (đã kiểm với 1.27). Không cần Android SDK/NDK, không cần CGO
# (CGO_ENABLED=0 ⇒ binary tĩnh, chạy được trên mọi distro Linux cùng kiến trúc).

param(
    [string]$Source = 'C:\Users\Minhn\hy-src\app',
    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutDir) { $OutDir = Join-Path $repoRoot '.tmp\gateway' }

if (-not (Test-Path (Join-Path $Source 'main.go'))) {
    throw "Không thấy '$Source\main.go' — trỏ -Source vào thư mục 'app' của hysteria (nơi có main.go)."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Go cần ghi build cache + module lock. Trên máy bị sandbox (workspace-write) thì cache mặc định
# nằm NGOÀI workspace ⇒ bị chặn. Trỏ vào trong repo cho chắc.
$env:CGO_ENABLED = '0'
$env:GOCACHE    = Join-Path $repoRoot '.tmp\gocache'
$env:GOTMPDIR   = Join-Path $repoRoot '.tmp\gotmp'
New-Item -ItemType Directory -Force -Path $env:GOTMPDIR | Out-Null

# target: tên file | GOOS | GOARCH | GOARM
$targets = @(
    @{ Name = 'hysteria-linux-arm64';       OS = 'linux';   Arch = 'arm64'; Arm = '' },
    @{ Name = 'hysteria-linux-armv7';        OS = 'linux';   Arch = 'arm';   Arm = '7' },
    @{ Name = 'hysteria-linux-amd64';        OS = 'linux';   Arch = 'amd64'; Arm = '' },
    @{ Name = 'hysteria-windows-amd64.exe';  OS = 'windows'; Arch = 'amd64'; Arm = '' }
)

Push-Location $Source
try {
    foreach ($t in $targets) {
        $env:GOOS = $t.OS
        $env:GOARCH = $t.Arch
        if ($t.Arm) { $env:GOARM = $t.Arm } else { Remove-Item Env:GOARM -ErrorAction SilentlyContinue }

        $out = Join-Path $OutDir $t.Name
        Write-Host "==> $($t.Name)  ($($t.OS)/$($t.Arch)$($t.Arm))"
        & go build -trimpath -ldflags '-s -w' -o $out .
        if ($LASTEXITCODE -ne 0) { throw "build FAILED: $($t.Name) (exit $LASTEXITCODE)" }

        $f = Get-Item $out
        $sha = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
        "{0,-26} {1,12} B  sha256={2}" -f $f.Name, $f.Length, $sha
    }
}
finally {
    Pop-Location
    Remove-Item Env:GOOS, Env:GOARCH -ErrorAction SilentlyContinue
    Remove-Item Env:GOARM -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Xong. Binary ở: $OutDir"
Write-Host "Cấu hình: chép tools/gateway/client-tun.yaml.template (hoặc client-proxy.yaml.template)"
Write-Host "          -> /etc/hysteria/client.yaml, điền <SERVER_IP>/<AUTH_PASSWORD>/<OBFS_PASSWORD>, chmod 600."
