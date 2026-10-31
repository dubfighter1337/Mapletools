<#
.SYNOPSIS
  Downloads boss icons (the small boss HP-bar portraits, "Mobicon ...") from the MapleStory wiki
  (maplestorywiki.net) to data/icons/bosses/<id>.png. The planner and schedule show them by boss id.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\fetch-boss-icons.ps1
.EXAMPLE
  # A new boss: its id from data/bosses.js and the wiki file name
  powershell -ExecutionPolicy Bypass -File tools\fetch-boss-icons.ps1 -Map @{ lomien = 'Mobicon_Lomien.png' }
#>
param(
  [hashtable]$Map = @{},
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot
$Api = 'https://maplestorywiki.net/api.php'
$Dir = Join-Path $Root 'data/icons/bosses'

# Boss id (data/bosses.js) -> wiki file.
$Files = @{
  black_mage = 'Mobicon_Black_Mage.png'; jupiter = 'Mobicon_Jupiter.png'; baldrix = 'Mobicon_Baldrix.png'
  limbo = 'Mobicon_Limbo_Enlightened_by_Truth.png'; malefic_star = 'Mobicon_Malefic_Star.png'
  kaling = 'Mobicon_Kaling.png'; first_adversary = 'Mobicon_First_Adversary.png'; kalos = 'Mobicon_Kalos_the_Guardian.png'
  seren = 'Mobicon_Chosen_Seren.png'; verus_hilla = 'Mobicon_Verus_Hilla.png'; darknell = 'Mobicon_Guard_Captain_Darknell.png'
  will = 'Mobicon_Will_(Phase_1).png'; slime = 'Mobicon_Guardian_Angel_Slime.png'; gloom = 'Mobicon_Giant_Monster_Gloom.png'
  lucid = 'Mobicon_Lucid.png'; lotus = 'Mobicon_Lotus.png'; damien = 'Mobicon_Damien.png'; akechi = 'Mobicon_Akechi_Mitsuhide.png'
  papulatus = 'Mobicon_Papulatus_Clock.png'; vellum = 'Mobicon_Vellum.png'; magnus = 'Mobicon_Magnus.png'
  crimson_queen = 'Mobicon_Crimson_Queen.png'; princess_no = 'Mobicon_Princess_No.png'; von_bon = 'Mobicon_Von_Bon.png'
  pierre = 'Mobicon_Pierre_(Red).png'; pink_bean = 'Mobicon_Pink_Bean.png'; zakum = 'Mobicon_Zakum.png'
  hilla = 'Mobicon_Hilla.png'; cygnus = 'Mobicon_Cygnus.png'
}
foreach ($k in $Map.Keys) { $Files[$k] = $Map[$k] }

New-Item -ItemType Directory -Force $Dir | Out-Null
foreach ($id in ($Files.Keys | Sort-Object)) {
  $out = Join-Path $Dir "$id.png"
  if ((Test-Path $out) -and -not $Force) { continue }
  $title = 'File:' + $Files[$id]
  $info = Invoke-RestMethod "$Api`?action=query&titles=$([uri]::EscapeDataString($title))&prop=imageinfo&iiprop=url&format=json"
  $page = @($info.query.pages.PSObject.Properties.Value)[0]
  if (-not $page.imageinfo) { Write-Warning "$id`: $($Files[$id]) not found on the wiki"; continue }
  Invoke-WebRequest -UseBasicParsing $page.imageinfo[0].url -OutFile $out
  Write-Host "$id <- $($Files[$id])"
}
