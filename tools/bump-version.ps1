# Stamps every app/ and data/ link in the pages with a new ?v=<stamp>, so browsers fetch the new files
# after an update instead of mixing them with old cached ones (GitHub Pages lets browsers cache 10 min).
# Run it before committing a change to anything in app/ or data/:
#   powershell -ExecutionPolicy Bypass -File tools\bump-version.ps1
param([string]$Stamp = (Get-Date -Format 'yyMMddHHmm'))

$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false
$pattern = '((?:src|href)="(?:app|data)/[^"?]+)(\?v=[^"]*)?"'

foreach ($page in Get-ChildItem -Path $root -Filter *.html) {
  $text = [IO.File]::ReadAllText($page.FullName)
  $new = [regex]::Replace($text, $pattern, ('$1?v=' + $Stamp + '"'))
  if ($new -ne $text) {
    [IO.File]::WriteAllText($page.FullName, $new, $utf8)
    Write-Host "$($page.Name): v=$Stamp"
  }
}
