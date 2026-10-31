<#
.SYNOPSIS
  Imports the boss info sheet (boss, 100% HP, level, AF/SAC needed, notes) into data/boss-info.js.
  The sheet lists each weekly boss once per difficulty, easiest first, in the same order as that
  boss's difficulties in data/bosses.js; this script pairs them up that way.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\import-boss-info.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\import-boss-info.ps1 -Source https://docs.google.com/spreadsheets/d/<id>/edit
#>
param(
  [string]$Source = '1vWqXl3indddE3iVxzyYTXI3mAXlutmnb5vDNRag9Cow',
  [string]$Sheet = 'Sheet1'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib/xlsx.ps1')
$work = Join-Path ([IO.Path]::GetTempPath()) 'mapletools-boss-info'
New-Item -ItemType Directory -Force $work | Out-Null

# Sheet name -> boss id in data/bosses.js
$Ids = @{
  'Zakum' = 'zakum'; 'Magnus' = 'magnus'; 'Hilla' = 'hilla'; 'Papulatus' = 'papulatus'; 'Pierre' = 'pierre'
  'Von Bon' = 'von_bon'; 'Crimson Queen' = 'crimson_queen'; 'Vellum' = 'vellum'; 'Pink Bean' = 'pink_bean'
  'Cygnus' = 'cygnus'; 'Lotus' = 'lotus'; 'Damien' = 'damien'; 'Guardian Angel Slime' = 'slime'; 'Lucid' = 'lucid'
  'Will' = 'will'; 'Gloom' = 'gloom'; 'Verus Hilla' = 'verus_hilla'; 'Darknell' = 'darknell'; 'Black Mage' = 'black_mage'
  'Chosen Seren' = 'seren'; 'Kalos the Guardian' = 'kalos'; 'First Adversary' = 'first_adversary'; 'Kaling' = 'kaling'
  'Malefic Star' = 'malefic_star'; 'Limbo' = 'limbo'; 'Baldrix' = 'baldrix'; 'Jupiter' = 'jupiter'
  'Princess No' = 'princess_no'; 'Akechi Mitsuhide' = 'akechi'
}

# Difficulties per boss id, in order, read from data/bosses.js ("modes: { Easy: ..., Normal: ... }").
$modes = @{}
foreach ($line in [IO.File]::ReadAllLines((Join-Path $Root 'data/bosses.js'))) {
  if ($line -match "id: '([a-z_]+)'.*modes: \{ ([^}]*) \}") {
    $modes[$Matches[1]] = @([regex]::Matches($Matches[2], '([A-Za-z]+):') | ForEach-Object { $_.Groups[1].Value.ToLower() })
  }
}

# "265 P1&4`n275 P2&3" -> per-phase values [265, 275, 275, 265]; a plain number stays a number.
function Read-Phased([string]$text) {
  $text = "$text".Trim()
  if ($text -match '^\d+(\.0+)?$') { return [int][double]$text }
  $byPhase = @{}
  foreach ($m in [regex]::Matches($text, '(\d+)\s*P([\d&]+)')) {
    foreach ($p in $m.Groups[2].Value.Split('&')) { $byPhase[[int]$p] = [int]$m.Groups[1].Value }
  }
  if (-not $byPhase.Count) { return $null }
  $max = ($byPhase.Keys | Measure-Object -Maximum).Maximum
  return @(1..$max | ForEach-Object { $byPhase[$_] })
}
function Js($v) {
  if ($null -eq $v) { return 'null' }
  if ($v -is [array]) { return '[' + (($v | ForEach-Object { Js $_ }) -join ', ') + ']' }
  return [string]$v
}

$path = Resolve-SheetSource $Source $work
$cells = Get-Cells (Open-Xlsx $path $work) $Sheet
$byRow = @{}
foreach ($k in $cells.Keys) {
  $p = Split-CellRef $k
  if (-not $byRow[$p.Row]) { $byRow[$p.Row] = @{} }
  $byRow[$p.Row][(Get-ColName $p.Col)] = $cells[$k].v
}

$seen = @{}
$lines = @()
$notes = ''
foreach ($r in ($byRow.Keys | Sort-Object)) {
  $row = $byRow[$r]
  if ($row['G'] -and $r -gt 1 -and -not $notes) { $notes = $row['G'] }
  $name = "$($row['B'])".Trim()
  if ($r -eq 1 -or -not $name) { continue }
  $id = $Ids[$name]
  if (-not $id) { Write-Warning "Row $r`: unknown boss '$name' (add it to `$Ids)"; continue }
  $i = [int]$seen[$id]; $seen[$id] = $i + 1
  $mode = @($modes[$id])[$i]
  if (-not $mode) { Write-Warning "Row $r`: $name has more rows than difficulties in data/bosses.js"; continue }
  $hp = [double]$row['C']
  $level = Read-Phased $row['E']
  $force = "$($row['F'])"
  $stat = ''
  if ($force -match '100%:\s*(\d+)') { $stat = "arc: $($Matches[1])" }
  elseif ($force.Trim()) { $stat = "sac: $(Js (Read-Phased $force))" }
  $parts = @("level: $(Js $level)", "hp: $($hp.ToString('R', [Globalization.CultureInfo]::InvariantCulture))")
  if ($stat) { $parts += $stat }
  $lines += "  '$id`:$mode': { $($parts -join ', ') },"
}

$noteText = ($notes -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ' '
$out = @(
  '// Boss stats per difficulty from the party''s boss info sheet (tools/import-boss-info.ps1 writes this file).'
  '// level: the boss level, or one per phase. hp: 100% HP. arc / sac: Arcane or Sacred Force needed (sac per'
  '// phase when it differs). Used by the Boss Schedule (members'' ARC / SAC) and the Bosses page.'
  "MapleData.bossInfoNotes = '$($noteText.Replace("'", "\'"))';"
  'MapleData.bossInfo = {'
) + $lines + @('};')
[IO.File]::WriteAllText((Join-Path $Root 'data/boss-info.js'), ($out -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "data/boss-info.js: $($lines.Count) boss difficulties"
