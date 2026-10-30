<#
.SYNOPSIS
  Turns a HEXA Matrix tracker sheet or an Erda Link tracker sheet into data/classes/<Id>.js
  (plus icons), and registers the class in data/classes/index.js.

.EXAMPLE
  # HEXA class (Soushi-style tracker or its per-class source sheet)
  powershell -ExecutionPolicy Bypass -File tools\import-class.ps1 -Source "https://docs.google.com/spreadsheets/d/<id>/edit" -Id ren -Name "Ren"

.EXAMPLE
  # Erda Link class (Erel/Sia-style tracker), also saving the levels typed into that sheet
  powershell -ExecutionPolicy Bypass -File tools\import-class.ps1 -Source C:\Downloads\erel.xlsx -Id erel -Name "Erel Light" -SaveLevels
#>
param(
  [Parameter(Mandatory = $true)] [string]$Source,
  [Parameter(Mandatory = $true)] [string]$Id,
  [Parameter(Mandatory = $true)] [string]$Name,
  [ValidateSet('auto', 'hexa', 'erdaLink')] [string]$System = 'auto',
  # Archetype for the class picker: Warrior, Mage, Archer, Thief or Pirate.
  [string]$Category,
  # Read current levels from this sheet instead of -Source (e.g. your own copy of the tracker).
  [string]$LevelsFrom,
  # Write the levels found in the sheet to data/my-levels.js (used as your starting point).
  [switch]$SaveLevels
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/xlsx.ps1')
. (Join-Path $PSScriptRoot 'lib/classfile.ps1')

$Root = Split-Path $PSScriptRoot
$Work = Join-Path ([IO.Path]::GetTempPath()) "maple-import-$PID"
New-Item -ItemType Directory -Force $Work | Out-Null
$Utf8 = $Utf8NoBom
$Warnings = New-Object System.Collections.Generic.List[string]

function Key([string]$s) { ($s -replace '\s+', ' ').Trim().ToLower() }

function Save-Icon([string]$From, [string]$FileName) {
  $dir = Join-Path $Root "data/icons/$Id"
  New-Item -ItemType Directory -Force $dir | Out-Null
  $dest = Join-Path $dir $FileName
  if ($From -match '^https?://') { Invoke-WebRequest -Uri $From -OutFile $dest -UseBasicParsing }
  else { Copy-Item $From $dest -Force }
  return "data/icons/$Id/$FileName"
}

# ---------------------------------------------------------------- HEXA Matrix

function Import-Hexa($Book) {
  $d1 = Get-Cells $Book 'data-1'
  $nodes = New-Object System.Collections.Generic.List[object]
  $lookup = @{}
  $sawOrigin = $false
  for ($r = 2; $r -le 100; $r++) {
    $nid = "$($d1["H$r"].v)".Trim()
    if (-not $nid) { continue }
    $type = "$($d1["I$r"].v)".Trim()
    $full = "$($d1["J$r"].v)".Trim()
    $alt = "$($d1["K$r"].v)".Trim()
    $alt2 = "$($d1["L$r"].v)".Trim()
    $iconUrl = "$($d1["N$r"].v)".Trim()

    $n = [ordered]@{ id = $nid; name = $full; short = $alt; group = 'other'; role = $type; min = 0; max = 30; cost = $null; icon = $null }
    switch ($type) {
      'V'         { $n.group = 'boost';   $n.role = 'Boost';    $n.cost = 'boost' }
      'Mastery'   { $n.group = 'mastery'; $n.role = 'Mastery';  $n.cost = 'mastery' }
      'Skill II'  { $n.group = 'skill';   $n.role = 'Skill III'; $n.cost = 'skill3' }
      'Common'    { $n.group = 'common';  $n.role = 'Common';   $n.cost = 'common' }
      'Common II' { $n.group = 'common';  $n.role = 'Common III'; $n.cost = 'common3' }
      'Skill' {
        $n.group = 'skill'
        if (-not $sawOrigin -and $alt -ne 'Ascent') { $n.role = 'Origin'; $n.min = 1; $n.cost = 'origin'; $sawOrigin = $true }
        else { $n.role = 'Ascent'; $n.cost = 'skill' }
      }
      default {
        if ($full -like 'HEXA Stat*') { $n.group = 'stat'; $n.role = 'HEXA Stat'; $n.max = 20 }
        else { $Warnings.Add("Node $nid ($full) has unknown type '$type'; it gets no costs.") }
      }
    }

    $common = Join-Path $Root ("data/icons/common/" + (Slug $full) + ".png")
    if (Test-Path $common) { $n.icon = "data/icons/common/" + (Slug $full) + ".png" }
    elseif (Test-Path (Join-Path $Root "data/icons/$Id/$nid.png")) { $n.icon = "data/icons/$Id/$nid.png" }  # e.g. from fetch-icons.ps1
    elseif ($iconUrl -match 'imgur\.com') {
      try { $n.icon = Save-Icon $iconUrl "$nid.png" } catch { $Warnings.Add("Icon download failed for $full") }
    }

    $nodes.Add($n)
    foreach ($k in @($full, $alt, $alt2, $nid)) { if ($k) { $lookup[(Key $k)] = $nid } }
  }

  $d0 = Get-Cells $Book 'data-0'
  $orders = New-Object System.Collections.Generic.List[object]
  for ($c = 2; $c -le 60; $c += 3) {
    $title = "$($d0[(Get-ColName $c) + '1'].v)".Trim()
    if (-not $title) { continue }
    $steps = New-Object System.Collections.Generic.List[object]
    for ($r = 2; $r -le 2000; $r++) {
      $sname = "$($d0[(Get-ColName $c) + $r].v)".Trim()
      if (-not $sname) { break }
      $lvl = ConvertTo-Int $d0[(Get-ColName ($c + 1)) + $r].v
      $nid = $lookup[(Key $sname)]
      if (-not $nid) { $Warnings.Add("Order '$title' step $($r - 1): unknown skill '$sname' (skipped)"); continue }
      $steps.Add(@($nid, $lvl))
    }
    $orders.Add([ordered]@{ id = (Slug $title); name = $title; steps = $steps })
  }

  $updated = ''
  for ($r = 1; $r -le 20; $r++) { if ("$($d1["O$r"].v)" -eq 'Update Date') { $updated = "$($d1["P$r"].v)" } }
  return @{ nodes = $nodes; orders = $orders; version = $updated; note = '' }
}

function Read-HexaLevels($Book, $Nodes) {
  $t = Get-Cells $Book 'Hexa Matrix Tracker'
  $levels = [ordered]@{}
  $ids = @{}; foreach ($n in $Nodes) { $ids[$n.id] = $true }
  foreach ($ref in $t.Keys) {
    $v = "$($t[$ref].v)".Trim()
    if (-not $ids.ContainsKey($v)) { continue }
    $p = Split-CellRef $ref
    $lvl = ConvertTo-Int $t[(Get-ColName ($p.col - 1)) + $p.row].v
    if ($null -ne $lvl) { $levels[$v] = $lvl }
  }
  # HEXA Stat nodes: three columns (R, V, Z) of three stat lines; node level = sum of its lines.
  if ("$($t['R25'].v)" -like '*HEXA Stat*') {
    $statIds = @($Nodes | Where-Object { $_.group -eq 'stat' } | ForEach-Object { $_.id })
    $cols = @('R', 'V', 'Z')
    for ($i = 0; $i -lt [math]::Min(3, $statIds.Count); $i++) {
      $sum = 0; foreach ($r in 29..31) { $x = ConvertTo-Int $t["$($cols[$i])$r"].v; if ($x) { $sum += $x } }
      $levels[$statIds[$i]] = $sum
    }
  }
  $selected = "$($t['L4'].v)".Trim()
  if ($selected -and $selected -ne $Name) { $Warnings.Add("That tracker has '$selected' selected, not '$Name'. Check the levels.") }
  return $levels
}

function Read-HexaPriority($Book) {
  # The priority picked in the tracker's "Choose Priority" dropdown, as an order id.
  $t = Get-Cells $Book 'Hexa Matrix Tracker'
  if ("$($t['L6'].v)" -like 'Choose Priority*' -and $t['L8'].v) { return (Slug "$($t['L8'].v)") }
  return $null
}

# ---------------------------------------------------------------- Erda Link

$StatBases = 'str|dex|int|luk|all stats|attack power|magic att|damage percentile|boss damage|ignore defense|critical damage|critical rate|normal enemy damage|abnormal status damage boost'
$UtilityBases = 'exp obtained|item drop rate|mesos obtained|buff duration|summon duration|skill cooldown|fruits of mastery|sacred power|fragment of distorted time'
$KeepCaps = @('EXP', 'ATT', 'STR', 'DEX', 'INT', 'LUK', 'M1', 'M2', 'SHINE')

function Nice-Name([string]$s) {
  if ($s -cne $s.ToUpper()) { return $s }
  ($s.ToLower() -split ' ' | ForEach-Object {
    if ($KeepCaps -contains $_.ToUpper()) { $_.ToUpper() } elseif ($_) { $_.Substring(0, 1).ToUpper() + $_.Substring(1) }
  }) -join ' '
}

function Read-ErdaTable($Book) {
  # The tracker keeps a "name -> level cell" table (formulas like =AI54 next to the node name).
  $t = Get-Cells $Book 'Tracker'
  $rows = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($ref in ($t.Keys | Sort-Object { (Split-CellRef $_).row })) {
    $f = $t[$ref].f
    if (-not $f -or $f -notmatch '^(Tracker!)?\$?([A-Z]{1,3})\$?(\d+)$') { continue }
    $inRef = $Matches[2] + $Matches[3]
    $p = Split-CellRef $ref
    $nm = "$($t[(Get-ColName ($p.col - 1)) + $p.row].v)".Trim()
    if (-not $nm -or $nm -match '^[\d.]+$' -or $seen.ContainsKey((Key $nm))) { continue }
    $seen[(Key $nm)] = $true
    $ip = Split-CellRef $inRef
    $rows.Add(@{ name = $nm; x = $ip.col; y = $ip.row; level = (ConvertTo-Int $t[$inRef].v) })
  }
  return $rows
}

function Import-ErdaLink($Book) {
  $table = Read-ErdaTable $Book
  if ($table.Count -eq 0) { throw "No node table found on the Tracker tab." }

  # Icons tab: column B = base name, C..H = numbered instances, picture anchored in column A.
  $ic = Get-Cells $Book 'Icons'
  $pics = @{}; foreach ($img in (Get-SheetImages $Book 'Icons')) { if ($img.col -eq 0) { $pics[$img.row + 1] = $img.file } }
  $iconOf = @{}; $baseOf = @{}
  for ($r = 1; $r -le 200; $r++) {
    $base = "$($ic["B$r"].v)".Trim()
    if (-not $base) { continue }
    foreach ($col in 'B', 'C', 'D', 'E', 'F', 'G', 'H') {
      $nm = "$($ic["$col$r"].v)".Trim()
      if (-not $nm) { continue }
      $baseOf[(Key $nm)] = $base
      if ($pics.ContainsKey($r)) { $iconOf[(Key $nm)] = $pics[$r] }
    }
  }

  # Order list: TrackerData A14.. = name, level, Sol Erda, fragments (imported by the tracker
  # from its author's sheet). The author's sheet also has step notes, so try that first.
  $td = Get-Cells $Book 'TrackerData'
  $order = New-Object System.Collections.Generic.List[object]
  for ($r = 14; $r -le 3000; $r++) {
    $nm = "$($td["A$r"].v)".Trim()
    if (-not $nm) { break }
    $order.Add(@{ name = $nm; level = (ConvertTo-Int $td["B$r"].v); erda = (ConvertTo-Int $td["C$r"].v); frags = (ConvertTo-Int $td["D$r"].v); note = '' })
  }
  $src = "$($td['A13'].f)"
  $m = [regex]::Match($src, 'IMPORTRANGE\(""(https://[^"]+)"",""([^!"]+)!')
  if ($m.Success) {
    $sid = [regex]::Match($m.Groups[1].Value, '/d/([A-Za-z0-9_-]+)').Groups[1].Value
    $tab = $m.Groups[2].Value
    try {
      $csv = (Invoke-WebRequest -UseBasicParsing "https://docs.google.com/spreadsheets/d/$sid/gviz/tq?tqx=out:csv&sheet=$tab").Content
      $rows = @($csv | ConvertFrom-Csv -Header (1..60 | ForEach-Object { "c$_" }) | Select-Object -Skip 1 | Where-Object { $_.c1 })
      $same = $rows.Count -eq $order.Count
      for ($i = 0; $same -and $i -lt $rows.Count; $i++) { if ((Key $rows[$i].c1) -ne (Key $order[$i].name)) { $same = $false } }
      if ($same) { for ($i = 0; $i -lt $rows.Count; $i++) { $order[$i].note = "$($rows[$i].c7)".Trim() } }
      else { $Warnings.Add("Author's order sheet differs from this tracker's copy; step notes skipped (re-import from a newer tracker to update).") }
    } catch { $Warnings.Add("Could not fetch step notes from the author's sheet: $($_.Exception.Message)") }
  }

  $byName = @{}; foreach ($row in $table) { $byName[(Key $row.name)] = $row }
  $stepsFor = @{}
  foreach ($s in $order) {
    $k = Key $s.name
    if (-not $byName.ContainsKey($k)) { $Warnings.Add("Order step '$($s.name)' is not on the board (skipped)"); continue }
    if (-not $stepsFor.ContainsKey($k)) { $stepsFor[$k] = New-Object System.Collections.Generic.List[object] }
    $stepsFor[$k].Add($s)
  }
  $shineMax = 0
  foreach ($k in $stepsFor.Keys) {
    if ($k -like 'shinestone*') { foreach ($s in $stepsFor[$k]) { if ($s.level -gt $shineMax) { $shineMax = $s.level } } }
  }

  $nodes = New-Object System.Collections.Generic.List[object]
  $idOf = @{}
  foreach ($row in $table) {
    $k = Key $row.name
    $base = if ($baseOf.ContainsKey($k)) { $baseOf[$k] } else { $row.name -replace '\s+\d+$', '' }
    $bk = Key $base
    if (-not $iconOf.ContainsKey($k) -and $iconOf.ContainsKey($bk)) { $iconOf[$k] = $iconOf[$bk] }
    $num = if ($row.name -match '\s(\d+)$' -and $base -notmatch '\d$') { ' ' + $Matches[1] } else { '' }
    $nid = Slug $row.name
    $display = if ($base -match '\d$') { Nice-Name $row.name } else { (Nice-Name $base) + $num }
    $n = [ordered]@{ id = $nid; name = $display; group = 'boost'; min = 0; max = 1; x = $row.x; y = $row.y; costs = $null; icon = $null }

    if ($bk -match '^(origin|ascent)$') { $n.group = 'skill' }
    elseif ($bk -match '^m\d$') { $n.group = 'mastery' }
    elseif ($bk -match '^(sol janus|sol hecate|tree of stars)$') { $n.group = 'common' }
    elseif ($bk -like 'shinestone*') { $n.group = 'shinestone' }
    elseif ($bk -match "^($StatBases)$") { $n.group = 'stat' }
    elseif ($bk -match "^($UtilityBases)$") { $n.group = 'utility' }
    elseif ($bk -eq 'lock') { $n.group = 'special' }
    if ($bk -eq 'origin') { $n.min = 1 }

    if ($stepsFor.ContainsKey($k)) {
      $steps = $stepsFor[$k]
      $n.max = 0; foreach ($s in $steps) { if ($s.level -gt $n.max) { $n.max = $s.level } }
      $costs = @(); for ($l = 1; $l -le $n.max; $l++) { $costs += , @(0, 0) }
      foreach ($s in $steps) { $costs[$s.level - 1] = @($s.erda, $s.frags) }
      $n.costs = $costs
    } elseif ($n.group -eq 'shinestone' -and $shineMax -gt 0) {
      $n.max = $shineMax
    } elseif ($n.group -eq 'boost') {
      $n.group = 'special'
    }

    $commonIcon = "data/icons/common/" + (Slug $base) + ".png"
    if (Test-Path (Join-Path $Root $commonIcon)) { $n.icon = $commonIcon }
    elseif ($iconOf.ContainsKey($k)) { $n.icon = Save-Icon $iconOf[$k] ((Slug $base) + '.png') }
    else { $Warnings.Add("No icon for '$($row.name)'") }
    $nodes.Add($n); $idOf[$k] = $nid
  }

  # The order only unlocks Sol Janus (EXP skill), but it levels to 30 on the same Common cost
  # table as Sol Hecate, so borrow Hecate's costs for the levels the order never reaches.
  $janus = $nodes | Where-Object { $_.id -eq 'sol-janus' } | Select-Object -First 1
  $hecate = $nodes | Where-Object { $_.id -eq 'sol-hecate' } | Select-Object -First 1
  if ($janus -and $hecate -and $hecate.costs -and $janus.max -lt $hecate.max) {
    $costs = @(); for ($l = 1; $l -le $hecate.max; $l++) {
      if ($janus.costs -and $l -le $janus.costs.Count) { $costs += , $janus.costs[$l - 1] } else { $costs += , $hecate.costs[$l - 1] }
    }
    $janus.costs = $costs; $janus.max = $hecate.max
  }

  $steps = New-Object System.Collections.Generic.List[object]
  foreach ($s in $order) {
    $k = Key $s.name
    if (-not $idOf.ContainsKey($k)) { continue }
    if ($s.note) { $steps.Add(@($idOf[$k], $s.level, $s.note)) } else { $steps.Add(@($idOf[$k], $s.level)) }
  }
  $version = "$($td['F13'].v)"
  $note = "$($td['M13'].v)".Trim()
  $title = "$($td['K13'].v)".Trim(); if (-not $title) { $title = 'Recommended order' }
  if ($version) { $title = "$title $version" }
  $orders = @([ordered]@{ id = (Slug $title); name = $title; steps = $steps })

  $levels = [ordered]@{}
  foreach ($row in $table) { if ($null -ne $row.level) { $levels[$idOf[(Key $row.name)]] = $row.level } }
  return @{ nodes = $nodes; orders = $orders; version = $version; note = $note; levels = $levels }
}

# ---------------------------------------------------------------- output

function Save-Levels($Levels, [string]$OrderId) {
  $path = Join-Path $Root 'data/my-levels.js'
  $lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path $path) { foreach ($l in (Get-Content -Encoding UTF8 $path)) { $lines.Add($l) } }
  else {
    $lines.Add('// Your levels (and chosen priority) as read from your own sheets. Used only the first time')
    $lines.Add('// a class is opened in a browser with no saved progress for it; after that the browser keeps yours.')
  }
  $set = {
    param([string]$Prefix, [string]$Line)
    $idx = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].StartsWith($Prefix)) { $idx = $i } }
    if ($idx -ge 0) { $lines[$idx] = $Line } else { $lines.Add($Line) }
  }
  & $set "MapleData.startingLevels[$(Js $Id)]" ("MapleData.startingLevels[$(Js $Id)] = {" + (($Levels.Keys | ForEach-Object { "$(Js $_): $($Levels[$_])" }) -join ', ') + '};')
  if ($OrderId) { & $set "MapleData.startingOrders[$(Js $Id)]" "MapleData.startingOrders[$(Js $Id)] = $(Js $OrderId);" }
  [IO.File]::WriteAllText($path, ($lines -join "`n") + "`n", $Utf8)
}

# ---------------------------------------------------------------- main

try {
  $xlsx = Resolve-SheetSource $Source $Work
  $book = Open-Xlsx $xlsx $Work
  if ($System -eq 'auto') {
    if ($book.Sheets.Contains('TrackerData')) { $System = 'erdaLink' }
    elseif ($book.Sheets.Contains('data-0') -and $book.Sheets.Contains('data-1')) { $System = 'hexa' }
    else { throw "Can't tell the sheet type. Tabs: $($book.Sheets.Keys -join ', '). Pass -System hexa or -System erdaLink." }
  }
  Write-Host "Importing $Name ($System)..."

  $data = if ($System -eq 'hexa') { Import-Hexa $book } else { Import-ErdaLink $book }
  $out = Write-ClassFile -Root $Root -Id $Id -Name $Name -System $System -Category $Category -Data $data -From $Source -Tool 'tools/import-class.ps1'
  Register-Class -Root $Root -Id $Id

  if ($SaveLevels) {
    $levelBook = $book
    if ($LevelsFrom) { $levelBook = Open-Xlsx (Resolve-SheetSource $LevelsFrom $Work) $Work }
    $levels = if ($System -eq 'hexa') { Read-HexaLevels $levelBook $data.nodes } else { $data.levels }
    if ($LevelsFrom -and $System -eq 'erdaLink') { $levels = (Import-ErdaLink $levelBook).levels }
    $orderId = $null
    if ($System -eq 'hexa') {
      $orderId = Read-HexaPriority $levelBook
      if ($orderId -and -not ($data.orders | Where-Object { $_.id -eq $orderId })) { $orderId = $null }
    }
    Save-Levels $levels $orderId
    Write-Host "Saved $($levels.Count) levels to data/my-levels.js"
  }

  $stepCount = ($data.orders | ForEach-Object { $_.steps.Count } | Measure-Object -Sum).Sum
  Write-Host "Wrote $out : $($data.nodes.Count) nodes, $($data.orders.Count) order(s), $stepCount steps, data version '$($data.version)'"
  foreach ($w in ($Warnings | Select-Object -Unique)) { Write-Warning $w }
} finally {
  Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
}
