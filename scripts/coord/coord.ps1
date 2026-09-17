<#
.SYNOPSIS
  Wrapper cho harness Windows goi bang viec dung chung (flowvpn-coord tren node-2).

.DESCRIPTION
  Bang viec nam tren node-2 (/var/lib/flowvpn-coord). Tu Windows phai nhay qua node-1:

      ssh -J root@103.173.155.50 root@165.101.114.162 flowvpn-coord <lenh>

  Script nay chi ghep san phan SSH do cho tien, va tu dien --owner windows --host <may>.

.EXAMPLE
  .\coord.ps1 list
  .\coord.ps1 check scripts/tg-bot/bot.mjs
  .\coord.ps1 claim -Area tg-bot -Files "scripts/tg-bot/bot.mjs" -Note "sua timeout long-poll"
  .\coord.ps1 release -Area tg-bot
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('list', 'check', 'claim', 'release', 'selftest')]
  [string]$Command,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$Rest = @(),

  [string]$Area,
  [string]$Files,
  [string]$Note,
  [int]$Ttl = 90,
  [string]$Status = 'done',
  [string]$Owner = 'windows',
  [string]$JumpHost = 'root@103.173.155.50',
  [string]$Server = 'root@165.101.114.162'
)

$ErrorActionPreference = 'Stop'

# Gia tri gui qua SSH phai duoc quote, neu khong shell o dau ben kia se cat tai dau cach
# (da xay ra that: --note "dung orchestrator + deploy bot" bi cat con "dung").
function Quote-Arg([string]$Value) {
  return "'" + ($Value -replace "'", "'\''") + "'"
}

$args = @($Command)
switch ($Command) {
  'claim' {
    if (-not $Area) { throw '-Area la bat buoc voi claim' }
    if (-not $Files) { throw '-Files la bat buoc voi claim' }
    $args += @('--owner', $Owner, '--area', $Area, '--files', (Quote-Arg $Files), '--ttl', "$Ttl", '--host', (Quote-Arg $env:COMPUTERNAME))
    if ($Note) { $args += @('--note', (Quote-Arg $Note)) }
  }
  'release' {
    if (-not $Area) { throw '-Area la bat buoc voi release' }
    $args += @('--owner', $Owner, '--area', $Area, '--status', $Status)
  }
  'check' { $args += @('--owner', $Owner) }
}

$args += $Rest
$remote = "flowvpn-coord " + ($args -join ' ')
Write-Verbose "ssh -J $JumpHost $Server $remote"
& ssh -o BatchMode=yes -o ConnectTimeout=10 -J $JumpHost $Server $remote
exit $LASTEXITCODE
