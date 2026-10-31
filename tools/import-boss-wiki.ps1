<#
.SYNOPSIS
  Reads each weekly boss's page on the MapleStory wiki (maplestorywiki.net) and writes data/boss-details.js:
  per difficulty the entry level, party size, time limit, death count and drops (GMS Heroic worlds;
  drops only for other regions or for Interactive worlds are left out). Drop icons go to data/icons/items.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\import-boss-wiki.ps1
.EXAMPLE
  # Data only, no icon downloads
  powershell -ExecutionPolicy Bypass -File tools\import-boss-wiki.ps1 -NoIcons
#>
param([switch]$NoIcons)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot
$Api = 'https://maplestorywiki.net/api.php'

# Boss id (data/bosses.js) -> wiki page with the boss infobox and drops.
$Pages = [ordered]@{
  black_mage = 'Black Mage/Monster'; jupiter = 'Jupiter/Monster'; kaling = 'Kaling/Monster'; first_adversary = 'First Adversary'
  kalos = 'Kalos/Monster'; seren = 'Seren/Monster'; baldrix = 'Baldrix/Monster'; malefic_star = 'Malefic Star'; limbo = 'Limbo/Monster'
  lotus = 'Lotus/Monster'; verus_hilla = 'Hilla/Monster (Reborn)'; darknell = 'Guard Captain Darknell/Monster'; will = 'Will/Monster'
  slime = 'Guardian Angel Slime'; gloom = 'Giant Monster Gloom'; lucid = 'Lucid/Monster'; damien = 'Damien/Monster'
  akechi = 'Akechi Mitsuhide'; papulatus = 'Papulatus'; vellum = 'Vellum'; magnus = 'Magnus/Monster'; princess_no = 'Princess No'
  zakum = 'Zakum'; pierre = 'Pierre'; von_bon = 'Von Bon'; crimson_queen = 'Crimson Queen'; cygnus = 'Cygnus/Monster'
  pink_bean = 'Pink Bean'; hilla = 'Hilla/Monster'
}
# The infobox numbers its difficulties with fixed codes.
$Code = @{ easy = 1; normal = 2; hard = 3; chaos = 4; extreme = 5 }
$Kinds = [ordered]@{ dropEquipment = 'equip'; dropSetup = 'setup'; dropUse = 'use'; dropEtc = 'etc' }

$modes = @{}
foreach ($line in [IO.File]::ReadAllLines((Join-Path $Root 'data/bosses.js'))) {
  if ($line -match "id: '([a-z_]+)'.*modes: \{ ([^}]*) \}") {
    $modes[$Matches[1]] = @([regex]::Matches($Matches[2], '([A-Za-z]+):') | ForEach-Object { $_.Groups[1].Value })
  }
}

function Plain([string]$s) {
  $s = [regex]::Replace($s, '\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', '$1')   # [[Page|Text]] -> Text
  $s = $s -replace "'''|''", '' -replace '<[^>]+>', ' ' -replace '\{\{[^}]*\}\}', ''
  return ($s -replace '\s+', ' ').Trim()
}
function Slug([string]$t) { return ($t.ToLower() -replace '[^a-z0-9]+', '-').Trim('-') }
function Js([string]$s) { return "'" + ($s -replace '\\', '\\' -replace "'", "\'") + "'" }

# Infobox value for a difficulty: the text before any "(see ...)" note, markup removed.
function Infobox([string]$w, [string]$field, [int]$n) {
  $m = [regex]::Match($w, "\|$field$n=([^\n]*)")
  if (-not $m.Success) { return '' }
  return (Plain (($m.Groups[1].Value -split ' \(')[0]))
}

# Drops of one {{Mob ...}} block: [kind, name, wiki page, extra (amount, notes)].
function Drops([string]$block) {
  $out = @()
  foreach ($field in $Kinds.Keys) {
    $m = [regex]::Match($block, "\|$field=(.*?)(?=\n\|[A-Za-z]+=|\n\}\})", 'Singleline')
    if (-not $m.Success) { continue }
    $parentLinked = $true
    foreach ($line in ($m.Groups[1].Value -split "`n")) {
      $sub = $line -match '^\*\*'
      if (-not ($line -match '^\*')) { continue }
      if ($sub -and $parentLinked) { continue }
      # The shown name may hold brackets ("Familiar [Common]"), so it runs to the "]]" that isn't followed by "]".
      $lm = [regex]::Match($line, '^\*+\s*\[\[([^\]|#]+)(#[^\]|]*)?(?:\|(.+?))?\]\](?!\])(.*)$')
      if (-not $lm.Success) { if (-not $sub) { $parentLinked = $false }; continue }
      if (-not $sub) { $parentLinked = $true }
      $rest = $lm.Groups[4].Value
      if ($rest -match 'KMS|JMS|CMS|TMS|MSEA' -and $rest -notmatch 'GMS') { continue }
      if ($rest -match 'Interactive / Non-Reboot Worlds only') { continue }
      $page = $lm.Groups[1].Value.Trim()
      $name = if ($lm.Groups[3].Success) { $lm.Groups[3].Value.Trim() } else { $page }
      $extra = Plain ($rest -replace '\(GMS only\)', '' -replace '\(GMS[^)]*Heroic[^)]*\)', '' -replace ' in GMS Heroic / Reboot Worlds', '')
      $out += , @($Kinds[$field], (Plain $name), $page, $extra.Trim(' ', ':'))
    }
  }
  return , $out
}

$lines = @()
$itemPages = @{}   # wiki page -> icon file name
$itemKind = @{}    # wiki page -> equip / setup / use / etc (for the icon's file name)
foreach ($id in $Pages.Keys) {
  $title = $Pages[$id]
  $r = Invoke-RestMethod "$Api`?action=parse&page=$([uri]::EscapeDataString($title))&prop=wikitext&format=json"
  if ($r.error) { Write-Warning "$id`: $($r.error.info)"; continue }
  $w = $r.parse.wikitext.'*'
  # Sections by heading, in page order.
  $heads = [regex]::Matches($w, '(?m)^(=+)\s*(.+?)\s*=+\s*$')
  $sections = @()
  for ($i = 0; $i -lt $heads.Count; $i++) {
    $start = $heads[$i].Index + $heads[$i].Length
    $end = if ($i + 1 -lt $heads.Count) { $heads[$i + 1].Index } else { $w.Length }
    $sections += , @($heads[$i].Groups[2].Value, $w.Substring($start, $end - $start))
  }
  foreach ($mode in @($modes[$id])) {
    $n = $Code[$mode.ToLower()]
    $mine = @($sections | Where-Object { $_[0] -eq $mode -or $_[0] -like "${mode}:*" })
    $reward = @($mine | Where-Object { $_[0] -match 'Reward' })
    $pick = $mine   # (an if-expression would unroll a single section into its two strings)
    if ($reward.Count) { $pick = $reward }
    $blocks = @($pick | ForEach-Object { $_[1] -split '\{\{Mob' } | Where-Object { $_ -match '\|drop(Equipment|Use|Etc)=' })
    $drops = if ($blocks.Count) { Drops $blocks[-1] } else { @() }
    if (-not $drops.Count) { Write-Warning "$id $mode`: no drops found" }
    foreach ($d in $drops) { $itemPages[$d[2]] = Slug $d[2]; if (-not $itemKind[$d[2]]) { $itemKind[$d[2]] = $d[0] } }
    # The icon is filled in at the end, once it's known which icons exist.
    $dropJs = ($drops | ForEach-Object { "[$(Js $_[0]), $(Js $_[1]), @@icon:$(Slug $_[2])@@$(if ($_[3]) { ', ' + (Js $_[3]) })]" }) -join ', '
    $info = @(
      "entry: $(Js (Infobox $w 'level' $n))", "party: $(Js (Infobox $w 'partySize' $n))",
      "time: $(Js (Infobox $w 'timeLimit' $n))", "deaths: $(Js (Infobox $w 'deathCount' $n))"
    ) -join ', '
    $lines += "  '$id`:$($mode.ToLower())': { $info, wiki: $(Js $title),"
    $lines += "    drops: [$dropJs] },"
  }
  Write-Host "$id ok"
}

$dir = Join-Path $Root 'data/icons/items'
New-Item -ItemType Directory -Force $dir | Out-Null
if (-not $NoIcons) {

# Asks the wiki about up to 40 titles at once and downloads what $Url picks from each page,
# saving it under the item it was asked for ($For maps the asked title to the item's wiki page).
function Fetch-Batch([hashtable]$For, [string]$Prop, [scriptblock]$Url) {
  $q = Invoke-RestMethod "$Api`?action=query&redirects=1&$Prop&titles=$([uri]::EscapeDataString($For.Keys -join '|'))&format=json"
  $back = @{}
  foreach ($k in $For.Keys) { $back[$k] = $For[$k] }
  foreach ($x in @($q.query.normalized)) { if ($x) { $back[$x.to] = $back[$x.from] } }   # titles the wiki
  foreach ($x in @($q.query.redirects)) { if ($x) { $back[$x.to] = $back[$x.from] } }    # renamed or moved
  foreach ($p in $q.query.pages.PSObject.Properties.Value) {
    $item = $back[$p.title]
    $src = if ($item) { & $Url $p }
    if (-not $src) { continue }
    try { Invoke-WebRequest -UseBasicParsing $src -OutFile (Join-Path $dir "$($itemPages[$item]).png") }
    catch { Write-Warning "icon for $item`: $($_.Exception.Message)" }
  }
}
function Missing { @($itemPages.Keys | Where-Object { -not (Test-Path (Join-Path $dir "$($itemPages[$_]).png")) }) }

# 1. The item's own icon: the wiki names them "Eqp <Item>.png", "Use <Item>.png", "Etc <Item>.png", "Setup <Item>.png".
#    Taken as the wiki's 48px thumbnail: some icons are big or animated, and the thumbnail is a small still image.
$Prefix = @{ equip = 'Eqp'; setup = 'Setup'; use = 'Use'; etc = 'Etc' }
$todo = Missing
for ($i = 0; $i -lt $todo.Count; $i += 40) {
  $for = @{}
  foreach ($b in $todo[$i..([math]::Min($i + 39, $todo.Count - 1))]) { $for["File:$($Prefix[$itemKind[$b]]) $b.png"] = $b }
  Fetch-Batch $for 'prop=imageinfo&iiprop=url&iiurlwidth=48' { param($p) if ($p.imageinfo) { $p.imageinfo[0].thumburl } }
}
# 2. Otherwise the item page's own image, as a small thumbnail (some pages show large artwork).
$todo = Missing
for ($i = 0; $i -lt $todo.Count; $i += 40) {
  $for = @{}
  foreach ($b in $todo[$i..([math]::Min($i + 39, $todo.Count - 1))]) { $for[$b] = $b }
  Fetch-Batch $for 'prop=pageimages&piprop=thumbnail&pithumbsize=48' { param($p) if ($p.thumbnail) { $p.thumbnail.source } }
}
# 3. The wiki can't shrink animated pictures (soul shards), so anything still big is dropped: the page shows a
#    plain box for those instead of a large download.
Add-Type -AssemblyName System.Drawing
foreach ($f in Get-ChildItem $dir -Filter *.png) {
  $img = [Drawing.Image]::FromFile($f.FullName)
  $big = $img.Width -gt 64 -or $img.Height -gt 64 -or $f.Length -gt 20KB
  $img.Dispose()
  if ($big) { Remove-Item $f.FullName }
}
$missing = Missing
Write-Host "icons: $((Get-ChildItem $dir -Filter *.png).Count) in data/icons/items; no icon for $($missing.Count): $($missing -join ', ')"
}

# Drops without an icon file get an empty icon, so the page shows a plain box instead of asking for a missing file.
$body = [regex]::Replace(($lines -join "`n"), '@@icon:([a-z0-9-]+)@@', {
  param($m) if (Test-Path (Join-Path $dir "$($m.Groups[1].Value).png")) { Js $m.Groups[1].Value } else { "''" } })
$out = @(
  '// Boss details per difficulty from the MapleStory wiki (tools/import-boss-wiki.ps1 writes this file):'
  '// entry level, party size, time limit, death count and drops for GMS Heroic worlds.'
  '// drops: [kind (equip, setup, use, etc), name, icon (data/icons/items/<icon>.png, empty: none), amount / notes].'
  'MapleData.bossDetails = {'
  $body
  '};'
)
[IO.File]::WriteAllText((Join-Path $Root 'data/boss-details.js'), ($out -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "data/boss-details.js: $($lines.Count / 2) boss difficulties, $($itemPages.Count) different drops"
