<#
.SYNOPSIS
  Finds icons for a class's nodes on the MapleStory wiki (maplestorywiki.net) and adds them
  to data/classes/<Id>.js. Only fills nodes that have no icon yet (unless -Force).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\fetch-icons.ps1 -Id ren
.EXAMPLE
  # Pick a specific wiki file for a node the name matching can't find
  powershell -ExecutionPolicy Bypass -File tools\fetch-icons.ps1 -Id hoyoung -Map @{ '3b' = 'Skill_HEXA_Heaven_Consuming_Flames.png' }
#>
param(
  [Parameter(Mandatory = $true)] [string]$Id,
  # Wiki page that shows the class's skills; defaults to "<Class Name>/Skills".
  [string]$WikiPage,
  # Node id -> wiki file name, for nodes the automatic matching gets wrong or misses.
  [hashtable]$Map = @{},
  [switch]$Force,
  # Only print what would be matched.
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot
$Api = 'https://maplestorywiki.net/api.php'
$Utf8 = New-Object Text.UTF8Encoding $false
$classFile = Join-Path $Root "data/classes/$Id.js"
if (-not (Test-Path $classFile)) { throw "No class file $classFile" }
$lines = [IO.File]::ReadAllLines($classFile, [Text.Encoding]::UTF8)

if (-not $WikiPage) {
  $nameLine = $lines | Where-Object { $_ -match '^\s*name:\s*"([^"]+)"' } | Select-Object -First 1
  $null = $nameLine -match '"([^"]+)"'
  $WikiPage = "$($Matches[1])/Skills"
}

# Words that don't help tell skills apart.
$Noise = @('skill', 'png', 'the', 'of', 'sword', 'first', 'second', 'third', 'fourth', 'fifth', 'final', 'and')
function Tokens([string]$s) {
  @(($s.ToLower() -replace '\.png$', '' -replace "[^a-z0-9]+", ' ').Split(' ') |
    Where-Object { $_ -and $Noise -notcontains $_ } | Select-Object -Unique)
}

Write-Host "Reading images on wiki page '$WikiPage'..."
$parse = Invoke-RestMethod "$Api`?action=parse&page=$([uri]::EscapeDataString($WikiPage))&prop=images&format=json"
if ($parse.error) { throw "Wiki: $($parse.error.info)" }
$files = @($parse.parse.images | Where-Object { $_ -match '^(Skill_|HEXA_)' })
Write-Host "  $($files.Count) skill images found"

function Best-File($node) {
  $want = Tokens $node.name
  if ($want.Count -eq 0) { return $null }
  $best = $null; $bestScore = -1
  foreach ($f in $files) {
    $have = Tokens $f
    $hit = @($want | Where-Object { $have -contains $_ }).Count
    $cover = $hit / $want.Count
    if ($hit -lt [math]::Min(2, $want.Count) -or $cover -lt 0.66) { continue }
    $isHexa = $f -match '(^|_)HEXA_'
    $score = $cover * 100 - ($have.Count - $hit) * 2
    if ($f -match 'Enhanced|_-_|\(') { $score -= 15 }               # variants / modifiers
    if ($node.group -eq 'mastery' -or $node.role -eq 'Common III') { if ($isHexa) { $score += 10 } }
    elseif ($isHexa) { $score -= 10 }
    if ($score -gt $bestScore) { $best = $f; $bestScore = $score }
  }
  return $best
}

$iconDir = Join-Path $Root "data/icons/$Id"
New-Item -ItemType Directory -Force $iconDir | Out-Null
$changed = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  if ($line -notmatch 'max: \d+' -or $line -notmatch '^\s*\{ id: "([^"]+)", name: "([^"]+)"') { continue }
  $node = @{ id = $Matches[1]; name = $Matches[2]; group = ''; role = '' }
  if ($line -match 'group: "([^"]+)"') { $node.group = $Matches[1] }
  if ($line -match 'role: "([^"]+)"') { $node.role = $Matches[1] }
  if ($node.group -eq 'stat') { continue }
  if ($line -match 'icon: "' -and -not $Force -and -not $Map.ContainsKey($node.id)) { continue }

  $file = if ($Map.ContainsKey($node.id)) { $Map[$node.id] } else { Best-File $node }
  if (-not $file) { Write-Host ("  {0,-4} {1,-45} -> (no match on the wiki)" -f $node.id, $node.name); continue }
  Write-Host ("  {0,-4} {1,-45} -> {2}" -f $node.id, $node.name, $file)
  if ($DryRun) { continue }

  $info = Invoke-RestMethod "$Api`?action=query&titles=$([uri]::EscapeDataString("File:$file"))&prop=imageinfo&iiprop=url&format=json"
  $page = $info.query.pages.PSObject.Properties | Select-Object -First 1
  $url = $page.Value.imageinfo[0].url
  if (-not $url) { Write-Warning "No download URL for $file"; continue }
  $rel = "data/icons/$Id/$($node.id).png"
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $Root $rel) -UseBasicParsing

  if ($line -match 'icon: "[^"]*"') { $line = $line -replace 'icon: "[^"]*"', "icon: `"$rel`"" }
  else { $line = $line -replace '(max: \d+, )', "`$1icon: `"$rel`", " }
  $lines[$i] = $line
  $changed++
}

if (-not $DryRun -and $changed) {
  [IO.File]::WriteAllText($classFile, ($lines -join "`n") + "`n", $Utf8)
}
Write-Host "Added $changed icon(s) to data/classes/$Id.js"
