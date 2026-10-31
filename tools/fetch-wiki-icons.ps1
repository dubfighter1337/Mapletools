<#
.SYNOPSIS
  Downloads icons from the MapleStory wiki (maplestorywiki.net):
    data/icons/bosses/<id>.png   boss HP-bar portraits ("Mobicon ..."), by boss id (data/bosses.js and daily bosses)
    data/icons/symbols/<id>.png  Arcane / Sacred / Grand Sacred symbols, by area (used by data/tasks.js)
  Files that are already there are skipped (unless -Force).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\fetch-wiki-icons.ps1
.EXAMPLE
  # A new boss: its id and the wiki file name
  powershell -ExecutionPolicy Bypass -File tools\fetch-wiki-icons.ps1 -Map @{ 'bosses/lomien' = 'Mobicon_Lomien.png' }
#>
param(
  # '<folder>/<id>' -> wiki file, added to (or replacing) the lists below.
  [hashtable]$Map = @{},
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot
$Api = 'https://maplestorywiki.net/api.php'

$Files = @{
  # weekly and monthly bosses
  'bosses/black_mage' = 'Mobicon_Black_Mage.png'; 'bosses/jupiter' = 'Mobicon_Jupiter.png'; 'bosses/baldrix' = 'Mobicon_Baldrix.png'
  'bosses/limbo' = 'Mobicon_Limbo_Enlightened_by_Truth.png'; 'bosses/malefic_star' = 'Mobicon_Malefic_Star.png'
  'bosses/kaling' = 'Mobicon_Kaling.png'; 'bosses/first_adversary' = 'Mobicon_First_Adversary.png'; 'bosses/kalos' = 'Mobicon_Kalos_the_Guardian.png'
  'bosses/seren' = 'Mobicon_Chosen_Seren.png'; 'bosses/verus_hilla' = 'Mobicon_Verus_Hilla.png'; 'bosses/darknell' = 'Mobicon_Guard_Captain_Darknell.png'
  'bosses/will' = 'Mobicon_Will_(Phase_1).png'; 'bosses/slime' = 'Mobicon_Guardian_Angel_Slime.png'; 'bosses/gloom' = 'Mobicon_Giant_Monster_Gloom.png'
  'bosses/lucid' = 'Mobicon_Lucid.png'; 'bosses/lotus' = 'Mobicon_Lotus.png'; 'bosses/damien' = 'Mobicon_Damien.png'; 'bosses/akechi' = 'Mobicon_Akechi_Mitsuhide.png'
  'bosses/papulatus' = 'Mobicon_Papulatus_Clock.png'; 'bosses/vellum' = 'Mobicon_Vellum.png'; 'bosses/magnus' = 'Mobicon_Magnus.png'
  'bosses/crimson_queen' = 'Mobicon_Crimson_Queen.png'; 'bosses/princess_no' = 'Mobicon_Princess_No.png'; 'bosses/von_bon' = 'Mobicon_Von_Bon.png'
  'bosses/pierre' = 'Mobicon_Pierre_(Red).png'; 'bosses/pink_bean' = 'Mobicon_Pink_Bean.png'; 'bosses/zakum' = 'Mobicon_Zakum.png'
  'bosses/hilla' = 'Mobicon_Hilla.png'; 'bosses/cygnus' = 'Mobicon_Cygnus.png'
  # daily-only bosses
  'bosses/horntail' = 'Mobicon_Horntail.png'; 'bosses/von_leon' = 'Mobicon_Von_Leon.png'; 'bosses/arkarium' = 'Mobicon_Arkarium.png'
  'bosses/mori_ranmaru' = 'Mobicon_Mori_Ranmaru.png'; 'bosses/gollux' = 'Mobicon_Gollux_Head.png'
  # symbols
  'symbols/arcane' = 'Eqp_Arcane_Symbol.png'
  'symbols/vanishing_journey' = 'Eqp_Arcane_Symbol_Vanishing_Journey.png'; 'symbols/chu_chu' = 'Eqp_Arcane_Symbol_Chu_Chu_Island.png'
  'symbols/lachelein' = 'Eqp_Arcane_Symbol_Lachelein.png'; 'symbols/arcana' = 'Eqp_Arcane_Symbol_Arcana.png'
  'symbols/morass' = 'Eqp_Arcane_Symbol_Morass.png'; 'symbols/esfera' = 'Eqp_Arcane_Symbol_Esfera.png'
  'symbols/cernium' = 'Eqp_Sacred_Symbol_Cernium.png'; 'symbols/arcus' = 'Eqp_Sacred_Symbol_Arcus.png'; 'symbols/odium' = 'Eqp_Sacred_Symbol_Odium.png'
  'symbols/shangri_la' = 'Eqp_Sacred_Symbol_Shangri-La.png'; 'symbols/arteria' = 'Eqp_Sacred_Symbol_Arteria.png'; 'symbols/carcion' = 'Eqp_Sacred_Symbol_Carcion.png'
  'symbols/tallahart' = 'Eqp_Grand_Sacred_Symbol_Tallahart.png'; 'symbols/geardock' = 'Eqp_Grand_Sacred_Symbol_Geardock.png'
}
foreach ($k in $Map.Keys) { $Files[$k] = $Map[$k] }

foreach ($key in ($Files.Keys | Sort-Object)) {
  $out = Join-Path $Root "data/icons/$key.png"
  if ((Test-Path $out) -and -not $Force) { continue }
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  $title = 'File:' + $Files[$key]
  $info = Invoke-RestMethod "$Api`?action=query&titles=$([uri]::EscapeDataString($title))&prop=imageinfo&iiprop=url&format=json"
  $page = @($info.query.pages.PSObject.Properties.Value)[0]
  if (-not $page.imageinfo) { Write-Warning "$key`: $($Files[$key]) not found on the wiki"; continue }
  Invoke-WebRequest -UseBasicParsing $page.imageinfo[0].url -OutFile $out
  Write-Host "$key <- $($Files[$key])"
}
