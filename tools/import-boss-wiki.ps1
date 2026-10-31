<#
.SYNOPSIS
  Reads each weekly boss's page on the MapleStory wiki (maplestorywiki.net) and writes data/boss-details.js:
  per difficulty the entry level, party size, time limit, death count and the drops that matter (GMS Heroic
  worlds): its gear (the signature drops), Arcane Umbra / AbsoLab / Eternal boxes, rings and Boss Ring Boxes,
  Sol Erda and Whisper crystals. Potions, scrolls, cubes, crystals and the like are left out, and so is
  anything only for other regions or Interactive worlds. Drop icons go to data/icons/items.

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
$Fields = @('dropEquipment', 'dropSetup', 'dropUse', 'dropEtc')
$Prefix = @{ dropEquipment = 'Eqp'; dropSetup = 'Setup'; dropUse = 'Use'; dropEtc = 'Etc' }   # wiki icon file names

# The drops worth showing, in this order: [group, test on the name (case-sensitive)]. Gear is every equipment
# drop; "sig" are a boss's own items: selection boxes, fragments to collect, Exceptional Hammers, its ring.
# Crafting materials (Confusion Fragment, Primal Essence), potions, scrolls, cubes and crystals don't match.
$Groups = @(
  @('sig', 'Selection Box|Exceptional Hammer|Lingering Twisted Desire|Trace of Eternal Loyalty|Whisper of Ancient Resolve|Entanglement Ring|Fantasy Fragment|Captivating Fragment'),
  @('box', 'Arcane Umbra|AbsoLab|Eternal'),
  @('ring', 'Boss Ring Box'),
  @('erda', 'Sol Erda'),
  @('whisper', 'Whisper Crystal')
)

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

# The drops worth showing from one {{Mob ...}} block: @{ group, name, page, field, extra }.
function Drops([string]$block) {
  $out = @()
  foreach ($field in $Fields) {
    $m = [regex]::Match($block, "\|$field=(.*?)(?=\n\|[A-Za-z]+=|\n\}\})", 'Singleline')
    if (-not $m.Success) { continue }
    $text = $m.Groups[1].Value
    if ($text -match '^\s*\[\[') { $text = '*' + $text.TrimStart() }   # one item on the field's own line
    $parentLinked = $true
    foreach ($line in ($text -split "`n")) {
      $sub = $line -match '^\*\*'
      if (-not ($line -match '^\*')) { continue }
      if ($sub -and $parentLinked) { continue }   # variants of a linked item; a heading's items (Sol Erda) are kept
      # The shown name may hold brackets ("Familiar [Common]"), so it runs to the "]]" that isn't followed by "]".
      $lm = [regex]::Match($line, '^\*+\s*\[\[([^\]|#]+)(#[^\]|]*)?(?:\|(.+?))?\]\](?!\])(.*)$')
      if (-not $lm.Success) { if (-not $sub) { $parentLinked = $false }; continue }
      if (-not $sub) { $parentLinked = $true }
      $rest = $lm.Groups[4].Value
      if ($rest -match 'KMS|JMS|CMS|TMS|MSEA' -and $rest -notmatch 'GMS') { continue }
      if ($rest -match 'Interactive / Non-Reboot Worlds only') { continue }
      $page = $lm.Groups[1].Value.Trim()
      $name = Plain $(if ($lm.Groups[3].Success) { $lm.Groups[3].Value.Trim() } else { $page })
      $group = if ($field -eq 'dropEquipment') { 'gear' } else { ($Groups | Where-Object { $name -cmatch $_[1] } | Select-Object -First 1 | ForEach-Object { $_[0] }) }
      if (-not $group) { continue }
      $extra = Plain ($rest -replace '\(GMS only\)', '' -replace '\(GMS[^)]*Heroic[^)]*\)', '' -replace ' in GMS Heroic / Reboot Worlds', '')
      $out += , @{ group = $group; name = $name; page = $page; field = $field; extra = $extra.Trim(' ', ':') }
    }
  }
  $order = @('gear') + @($Groups | ForEach-Object { $_[0] })
  return , @($out | Sort-Object { $order.IndexOf($_.group) })
}

$lines = @()
$items = @{}   # icon name (slug of the item's name) -> @{ name; page; field }
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
    # The difficulty's drops are in its last monster box: the "Reward" one when there is one.
    $mine = @($sections | Where-Object { $_[0] -eq $mode -or $_[0] -like "${mode}:*" })
    $reward = @($mine | Where-Object { $_[0] -match 'Reward' })
    $pick = $mine   # (an if-expression would unroll a single section into its two strings)
    if ($reward.Count) { $pick = $reward }
    $blocks = @($pick | ForEach-Object { $_[1] -split '\{\{Mob' } | Where-Object { $_ -match '\|drop(Equipment|Use|Etc)=' })
    $drops = if ($blocks.Count) { Drops $blocks[-1] } else { @() }
    if (-not $drops.Count) { Write-Warning "$id $mode`: no drops worth showing" }
    foreach ($d in $drops) { $s = Slug $d.name; if (-not $items[$s]) { $items[$s] = $d } }
    # The icon is filled in at the end, once it's known which icons exist.
    $dropJs = ($drops | ForEach-Object { "[$(Js $_.group), $(Js $_.name), @@icon:$(Slug $_.name)@@$(if ($_.extra) { ', ' + (Js $_.extra) })]" }) -join ', '
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
  # Asks the wiki about up to 40 titles at once and saves what $Url picks from each page as $For[title]'s icon.
  function Fetch-Batch([hashtable]$For, [string]$Prop, [scriptblock]$Url) {
    $q = Invoke-RestMethod "$Api`?action=query&redirects=1&$Prop&titles=$([uri]::EscapeDataString($For.Keys -join '|'))&format=json"
    $back = @{}
    foreach ($k in $For.Keys) { $back[$k] = $For[$k] }
    foreach ($x in @($q.query.normalized)) { if ($x) { $back[$x.to] = $back[$x.from] } }   # titles the wiki
    foreach ($x in @($q.query.redirects)) { if ($x) { $back[$x.to] = $back[$x.from] } }    # renamed or moved
    foreach ($p in $q.query.pages.PSObject.Properties.Value) {
      $slug = $back[$p.title]
      $src = if ($slug) { & $Url $p }
      if (-not $src) { continue }
      try { Invoke-WebRequest -UseBasicParsing $src -OutFile (Join-Path $dir "$slug.png") }
      catch { Write-Warning "icon for $($items[$slug].name): $($_.Exception.Message)" }
    }
  }
  function Missing { @($items.Keys | Where-Object { -not (Test-Path (Join-Path $dir "$_.png")) }) }
  function Each-Batch([scriptblock]$Title, [string]$Prop, [scriptblock]$Url) {
    $todo = Missing
    for ($i = 0; $i -lt $todo.Count; $i += 40) {
      $for = @{}
      foreach ($s in $todo[$i..([math]::Min($i + 39, $todo.Count - 1))]) { $for[(& $Title $items[$s])] = $s }
      Fetch-Batch $for $Prop $Url
    }
  }

  # Icons are the wiki's 48px thumbnails (some are big or animated, the thumbnail is a small still image),
  # tried as "Use White Jade Boss Ring Box.png" (the item's own name), then by its page, then the page's image.
  $thumb = { param($p) if ($p.imageinfo) { $p.imageinfo[0].thumburl } }
  Each-Batch { param($it) "File:$($Prefix[$it.field]) $($it.name).png" } 'prop=imageinfo&iiprop=url&iiurlwidth=48' $thumb
  Each-Batch { param($it) "File:$($Prefix[$it.field]) $($it.page).png" } 'prop=imageinfo&iiprop=url&iiurlwidth=48' $thumb
  Each-Batch { param($it) $it.page } 'prop=pageimages&piprop=thumbnail&pithumbsize=48' { param($p) if ($p.thumbnail) { $p.thumbnail.source } }
  # The wiki can't shrink animated pictures, so anything still big is dropped (the page shows a plain box),
  # and so are icons no drop uses any more.
  Add-Type -AssemblyName System.Drawing
  foreach ($f in Get-ChildItem $dir -Filter *.png) {
    if (-not $items[$f.BaseName]) { Remove-Item $f.FullName; continue }
    $img = [Drawing.Image]::FromFile($f.FullName)
    $big = $img.Width -gt 64 -or $img.Height -gt 64 -or $f.Length -gt 20KB
    $img.Dispose()
    if ($big) { Remove-Item $f.FullName }
  }
  $missing = @(Missing | ForEach-Object { $items[$_].name })
  Write-Host "icons: $((Get-ChildItem $dir -Filter *.png).Count) in data/icons/items; no icon for $($missing.Count): $($missing -join ', ')"
}

# Drops without an icon file get an empty icon, so the page shows a plain box instead of asking for a missing file.
$body = [regex]::Replace(($lines -join "`n"), '@@icon:([a-z0-9-]+)@@', {
  param($m) if (Test-Path (Join-Path $dir "$($m.Groups[1].Value).png")) { Js $m.Groups[1].Value } else { "''" } })
$out = @(
  '// Boss details per difficulty from the MapleStory wiki (tools/import-boss-wiki.ps1 writes this file):'
  '// entry level, party size, time limit, death count and the drops that matter, for GMS Heroic worlds.'
  '// drops: [group (gear, sig, box, ring, erda, whisper), name, icon (data/icons/items/<icon>.png, empty: none), amount / notes].'
  'MapleData.bossDetails = {'
  $body
  '};'
)
[IO.File]::WriteAllText((Join-Path $Root 'data/boss-details.js'), ($out -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "data/boss-details.js: $($lines.Count / 2) boss difficulties, $($items.Count) different drops"
