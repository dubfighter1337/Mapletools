# Turns a MapleStory mushroom picture (PNG or WebP with a transparent background) into the site logo:
# every colour is moved to the site's teal (hue 175, like the diamond), shading and face are kept,
# and the faint drop shadow underneath is removed.
#   powershell -ExecutionPolicy Bypass -File tools\make-logo.ps1 -Source C:\path\mushroom.webp
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Out = (Join-Path (Split-Path -Parent $PSScriptRoot) 'app\mushroom.png'),
  [double]$Hue = 175,
  [double]$Saturation = 0.82,   # teal at full saturation is louder than the site's accent
  [int]$Size = 128
)
Add-Type -AssemblyName PresentationCore, WindowsBase

function ConvertTo-Rgb([double]$h, [double]$s, [double]$l) {
  if ($s -eq 0) { $v = [byte][math]::Round($l * 255); return @($v, $v, $v) }
  $q = if ($l -lt 0.5) { $l * (1 + $s) } else { $l + $s - $l * $s }
  $p = 2 * $l - $q
  $out = foreach ($t in @(($h + 1 / 3), $h, ($h - 1 / 3))) {
    if ($t -lt 0) { $t += 1 }
    if ($t -gt 1) { $t -= 1 }
    $c = if ($t -lt 1 / 6) { $p + ($q - $p) * 6 * $t }
         elseif ($t -lt 1 / 2) { $q }
         elseif ($t -lt 2 / 3) { $p + ($q - $p) * (2 / 3 - $t) * 6 }
         else { $p }
    [byte][math]::Round($c * 255)
  }
  return $out
}

$fs = [IO.File]::OpenRead((Resolve-Path $Source))
try {
  $frame = [Windows.Media.Imaging.BitmapDecoder]::Create($fs, 'PreservePixelFormat', 'OnLoad').Frames[0]
} finally { $fs.Close() }
$scale = $Size / [double]$frame.PixelWidth
$scaled = New-Object Windows.Media.Imaging.TransformedBitmap($frame, (New-Object Windows.Media.ScaleTransform($scale, $scale)))
$bmp = New-Object Windows.Media.Imaging.FormatConvertedBitmap($scaled, [Windows.Media.PixelFormats]::Bgra32, $null, 0)
$w = $bmp.PixelWidth; $h = $bmp.PixelHeight; $stride = $w * 4
$px = New-Object byte[] ($stride * $h)
$bmp.CopyPixels($px, $stride, 0)

$targetHue = $Hue / 360
for ($i = 0; $i -lt $px.Length; $i += 4) {
  $a = $px[$i + 3]
  if ($a -eq 0) { continue }
  $r = $px[$i + 2] / 255.0; $g = $px[$i + 1] / 255.0; $b = $px[$i] / 255.0
  $max = [math]::Max($r, [math]::Max($g, $b)); $min = [math]::Min($r, [math]::Min($g, $b))
  if ($max -lt 0.08 -and $a -lt 90) { $px[$i + 3] = 0; continue }   # drop shadow
  $l = ($max + $min) / 2
  $s = if ($max -eq $min) { 0 } else { ($max - $min) / (1 - [math]::Abs(2 * $l - 1)) }
  $rgb = ConvertTo-Rgb $targetHue ([math]::Min(1, $s * $Saturation)) $l
  $px[$i + 2] = $rgb[0]; $px[$i + 1] = $rgb[1]; $px[$i] = $rgb[2]
}

$result = [Windows.Media.Imaging.BitmapSource]::Create($w, $h, 96, 96, [Windows.Media.PixelFormats]::Bgra32, $null, $px, $stride)
$enc = New-Object Windows.Media.Imaging.PngBitmapEncoder
$enc.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($result))
$os = [IO.File]::Create($Out)
try { $enc.Save($os) } finally { $os.Close() }
Write-Host "wrote $Out (${w}x${h})"
