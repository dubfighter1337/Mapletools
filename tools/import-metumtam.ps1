<#
.SYNOPSIS
  Imports HEXA classes from Metumtam's data.js (MapleScouter priority orders for every class)
  into data/classes/<id>.js, with icons, and registers them in data/classes/index.js.

.EXAMPLE
  # Everything except the classes that already have their own source
  powershell -ExecutionPolicy Bypass -File tools\import-metumtam.ps1
.EXAMPLE
  # Just one or two classes
  powershell -ExecutionPolicy Bypass -File tools\import-metumtam.ps1 -Only kain,lara
#>
param(
  # Metumtam's data file: a URL or a local copy.
  [string]$Source = 'https://darealshekel.github.io/Metumtam/data.js',
  # Base URL that Metumtam's icon paths ("assets/x.png") are relative to.
  [string]$AssetBase = 'https://darealshekel.github.io/Metumtam/',
  # Metumtam class ids to import (default: all of them minus -Skip).
  [string[]]$Only,
  # Classes that come from elsewhere: Soushi's sheets (hoyoung, ren) and the Erda Link trackers (erel, sia).
  [string[]]$Skip = @('hoyoung', 'ren', 'erel', 'sia')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/classfile.ps1')
Add-Type -AssemblyName System.Web.Extensions

$Root = Split-Path $PSScriptRoot

if ($Source -match '^https?://') {
  Write-Host "Downloading $Source"
  $raw = (Invoke-WebRequest -Uri $Source -UseBasicParsing).Content
} else {
  $raw = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Source), [Text.Encoding]::UTF8)
}
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$data = $ser.DeserializeObject($raw.Substring($raw.IndexOf('{')).Trim().TrimEnd(';'))
# Keep this file ASCII (Windows PowerShell reads BOM-less scripts as ANSI): build special characters.
$Dot = [string][char]0x00B7
$version = "Metumtam v$($data['version']) $Dot MapleScouter $($data['date'])"
Write-Host "$version, $($data['classes'].Count) classes"

$RomanStat = @{ '1' = 'I'; '2' = 'II'; '3' = 'III' }
$HangulRange = "[$([char]0xAC00)-$([char]0xD7A3)]"
$hasHangul = { param($s) $s -match $HangulRange }

function Get-Icon([string]$ClassId, [string]$NodeId, [string]$Rel) {
  if (-not $Rel) { return $null }
  $file = "data/icons/$ClassId/$NodeId.png"
  $dest = Join-Path $Root $file
  if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
    Invoke-WebRequest -Uri ($AssetBase + $Rel) -OutFile $dest -UseBasicParsing
  }
  return $file
}

# Our node for one Metumtam core: group, role, cost table and level range.
function Convert-Core($ClassId, $core) {
  $cid = $core['id']
  $n = [ordered]@{ id = $cid; name = "$($core['name'])"; short = ''; nameKo = ''; group = 'other'; role = ''; min = 0; max = 30; cost = $null; icon = $null }
  switch -Regex ($cid) {
    '^skillCore1$'  { $n.group = 'skill';   $n.role = 'Origin';     $n.cost = 'origin'; $n.min = 1 }
    '^skillCore2$'  { $n.group = 'skill';   $n.role = 'Ascent';     $n.cost = 'skill' }
    '^skillCore3$'  { $n.group = 'skill';   $n.role = 'Skill III';  $n.cost = 'skill3' }
    '^masteryCore'  { $n.group = 'mastery'; $n.role = 'Mastery';    $n.cost = 'mastery' }
    '^reinCore'     { $n.group = 'boost';   $n.role = 'Boost';      $n.cost = 'boost' }
    '^generalCore2$' { $n.group = 'common'; $n.role = 'Common';     $n.cost = 'common'; $n.name = 'Sol Hecate'; $n.icon = 'data/icons/common/sol-hecate.png' }
    '^generalCore3$' { $n.group = 'common'; $n.role = 'Common III'; $n.cost = 'common3' }
    '^hexaStat(\d)$' {
      $roman = $RomanStat[$Matches[1]]
      $n.group = 'stat'; $n.role = 'HEXA Stat'; $n.max = 20; $n.name = "HEXA Stat $roman"
      $n.icon = "data/icons/common/hexa-stat-$($Matches[1]).png"
    }
  }
  if (& $hasHangul $n.name) {
    # Not translated yet (mostly the 3rd skill node): show the role, keep the Korean name as a subtitle.
    $n.nameKo = $n.name; $n.name = $n.role
  } elseif ($core['nameKo'] -and $n.group -ne 'stat' -and $cid -ne 'generalCore2') {
    $n.nameKo = "$($core['nameKo'])"
  }
  if (-not $n.icon) { $n.icon = Get-Icon $ClassId $cid "$($core['icon'])" }
  return $n
}

$RoleOrder = @{ skill = 1; mastery = 2; boost = 3; common = 4; stat = 5; other = 6 }
$count = 0
foreach ($c in $data['classes']) {
  $id = "$($c['id'])"
  if ($Only -and $Only -notcontains $id) { continue }
  if (-not $Only -and $Skip -contains $id) { continue }
  if (-not $c['available']) { Write-Warning "$id is marked unavailable; skipped"; continue }

  $nodes = New-Object System.Collections.Generic.List[object]
  foreach ($core in $c['cores']) { $nodes.Add((Convert-Core $id $core)) }
  # Sol Janus isn't in Metumtam (it isn't part of any damage order), but it's a node you level.
  if (-not ($nodes | Where-Object { $_.name -eq 'Sol Janus' })) {
    $nodes.Add([ordered]@{ id = 'generalCore1'; name = 'Sol Janus'; short = ''; nameKo = ''; group = 'common'; role = 'Common'; min = 0; max = 30; cost = 'common'; icon = 'data/icons/common/sol-janus.png' })
  }
  $nodes = @($nodes | Sort-Object { $RoleOrder[$_.group] }, { $_.id })

  $orders = New-Object System.Collections.Generic.List[object]
  foreach ($mode in @(@('fragments', 'Fragments are the limit'), @('erda', 'Sol Erda is the limit'))) {
    $src = $c['orders'][$mode[0]]
    if (-not $src) { continue }
    $steps = New-Object System.Collections.Generic.List[object]
    foreach ($s in $src) {
      $sid = "$($s['id'])"
      $to = [int]$s['to']
      if ($sid -match '^hexaStat') { $to = 20 }   # Metumtam treats a HEXA Stat node as one step
      $steps.Add(@($sid, $to))
    }
    $orders.Add([ordered]@{ id = "scouter-$($mode[0])"; name = "MapleScouter $Dot $($mode[1])"; steps = $steps })
  }

  $note = 'Priority from MapleScouter via Metumtam.'
  if ($c['profileRegion'] -eq 'kms') { $note += ' Calculated with KMS data, so some skills may be ahead of GMS.' }
  $out = Write-ClassFile -Root $Root -Id $id -Name "$($c['name'])" -System 'hexa' -Category "$($c['category'])" `
    -Data @{ nodes = $nodes; orders = $orders; version = $version; note = $note } -From $Source -Tool 'tools/import-metumtam.ps1'
  Register-Class -Root $Root -Id $id
  $count++
  Write-Host ("  {0,-22} {1,2} nodes, {2} + {3} steps" -f $c['name'], $nodes.Count, $orders[0].steps.Count, $(if ($orders.Count -gt 1) { $orders[1].steps.Count } else { 0 }))
}
Write-Host "Imported $count classes."
