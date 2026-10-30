# Minimal .xlsx reader for the importer: cells (values + formulas) and anchored images.
# An .xlsx is a zip of XML parts; we only read what the tracker sheets need.

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-SheetSource([string]$Source, [string]$WorkDir) {
  # Accepts a local .xlsx path, a Google Sheets URL, or a bare spreadsheet id.
  if ($Source -notmatch '^https?://' -and (Test-Path -LiteralPath $Source)) { return (Resolve-Path -LiteralPath $Source).Path }
  $id = $Source
  if ($Source -match '/d/([A-Za-z0-9_-]+)') { $id = $Matches[1] }
  $out = Join-Path $WorkDir "$id.xlsx"
  $url = "https://docs.google.com/spreadsheets/d/$id/export?format=xlsx"
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
  $head = [IO.File]::ReadAllBytes($out)[0..1]
  if ($head[0] -ne 0x50 -or $head[1] -ne 0x4B) {
    throw "Download is not an .xlsx (is the sheet shared as 'Anyone with the link'?)"
  }
  return $out
}

function Open-Xlsx([string]$Path, [string]$WorkDir) {
  $dir = Join-Path $WorkDir ([IO.Path]::GetFileNameWithoutExtension($Path) + '_x')
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  [IO.Compression.ZipFile]::ExtractToDirectory($Path, $dir)

  $strings = New-Object System.Collections.Generic.List[string]
  $ssPath = Join-Path $dir 'xl/sharedStrings.xml'
  if (Test-Path $ssPath) {
    [xml]$sx = Get-Content -Raw -Encoding UTF8 $ssPath
    foreach ($si in $sx.sst.si) { $strings.Add($si.InnerText) }
  }

  [xml]$wb = Get-Content -Raw -Encoding UTF8 (Join-Path $dir 'xl/workbook.xml')
  [xml]$rels = Get-Content -Raw -Encoding UTF8 (Join-Path $dir 'xl/_rels/workbook.xml.rels')
  $sheets = [ordered]@{}
  foreach ($sh in $wb.workbook.sheets.sheet) {
    $rid = $sh.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = ($rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid }).Target
    $sheets[$sh.name] = Join-Path $dir ('xl/' + $target)
  }
  return [pscustomobject]@{ Dir = $dir; Strings = $strings; Sheets = $sheets }
}

function Get-Cells($Book, [string]$SheetName) {
  # Returns a hashtable "A1" -> @{ v = value; f = formula } for every non-empty cell.
  $path = $Book.Sheets[$SheetName]
  if (-not $path) { throw "Sheet '$SheetName' not found. Tabs: $($Book.Sheets.Keys -join ', ')" }
  [xml]$x = Get-Content -Raw -Encoding UTF8 $path
  $cells = @{}
  foreach ($row in $x.worksheet.sheetData.row) {
    foreach ($c in $row.c) {
      $f = $null; $v = $null
      if ($c.f) { $f = if ($c.f -is [string]) { $c.f } else { $c.f.InnerText } }
      if ($c.t -eq 's' -and $c.v) { $v = $Book.Strings[[int]$c.v] }
      elseif ($c.t -eq 'inlineStr') { $v = $c.is.InnerText }
      elseif ($c.v) { $v = if ($c.v -is [string]) { $c.v } else { $c.v.InnerText } }
      if ($null -ne $f -or $null -ne $v) { $cells[$c.r] = @{ v = $v; f = $f } }
    }
  }
  return $cells
}

function Get-SheetImages($Book, [string]$SheetName) {
  # Images anchored on a sheet: @{ col = 0-based; row = 0-based; file = media path }.
  $sheetPath = $Book.Sheets[$SheetName]
  $relPath = Join-Path (Split-Path $sheetPath) ('_rels/' + (Split-Path $sheetPath -Leaf) + '.rels')
  if (-not (Test-Path $relPath)) { return @() }
  [xml]$sr = Get-Content -Raw -Encoding UTF8 $relPath
  $drawRel = $sr.Relationships.Relationship | Where-Object { $_.Type -like '*/drawing' } | Select-Object -First 1
  if (-not $drawRel) { return @() }
  $drawPath = [IO.Path]::GetFullPath((Join-Path (Split-Path $sheetPath) $drawRel.Target))
  $drawRelPath = Join-Path (Split-Path $drawPath) ('_rels/' + (Split-Path $drawPath -Leaf) + '.rels')
  [xml]$dr = Get-Content -Raw -Encoding UTF8 $drawRelPath
  $media = @{}
  foreach ($r in $dr.Relationships.Relationship) {
    $media[$r.Id] = [IO.Path]::GetFullPath((Join-Path (Split-Path $drawPath) $r.Target))
  }
  $raw = Get-Content -Raw -Encoding UTF8 $drawPath
  $found = @()
  $anchors = [regex]::Matches($raw, '<xdr:(oneCellAnchor|twoCellAnchor)[\s\S]*?</xdr:\1>')
  foreach ($a in $anchors) {
    $m = [regex]::Match($a.Value, '<xdr:from><xdr:col>(\d+)</xdr:col>.*?<xdr:row>(\d+)</xdr:row>')
    $e = [regex]::Match($a.Value, 'r:embed="([^"]+)"')
    if ($m.Success -and $e.Success -and $media.ContainsKey($e.Groups[1].Value)) {
      $found += @{ col = [int]$m.Groups[1].Value; row = [int]$m.Groups[2].Value; file = $media[$e.Groups[1].Value] }
    }
  }
  return $found
}

function Split-CellRef([string]$Ref) {
  # "AI54" -> @{ col = 35; row = 54 } (1-based column index).
  $m = [regex]::Match($Ref, '^\$?([A-Z]{1,3})\$?(\d+)$')
  if (-not $m.Success) { return $null }
  $col = 0
  foreach ($ch in $m.Groups[1].Value.ToCharArray()) { $col = $col * 26 + ([int]$ch - 64) }
  return @{ col = $col; row = [int]$m.Groups[2].Value }
}

function Get-ColName([int]$Col) {
  $s = ''
  while ($Col -gt 0) { $r = ($Col - 1) % 26; $s = [char](65 + $r) + $s; $Col = [math]::Floor(($Col - 1) / 26) }
  return $s
}

function ConvertTo-Int($Value) {
  if ($null -eq $Value -or "$Value" -eq '') { return $null }
  $d = 0.0
  if ([double]::TryParse("$Value", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) {
    return [int][math]::Round($d)
  }
  return $null
}
