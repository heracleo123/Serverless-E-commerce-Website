$ErrorActionPreference = 'Stop'

$bucket = 'electrotech-frontend-e6717a42'
$repoRoot = Split-Path -Parent $PSScriptRoot
$oldBase = 'https://electrotech-assets-2026-v1.s3.us-east-1.amazonaws.com/'
$tempDir = Join-Path $env:TEMP 'electrotech-image-restore'

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$localMap = @{
  '1775479948730-Xiaomi_16_Ultra-1.webp' = (Join-Path $repoRoot 'ProductImages\xiaomi.jpg')
  '1775480026371-SnapTripod1.webp' = (Join-Path $repoRoot 'ProductImages\Snap-on Tripod Wallet - 1.webp')
  '1775480026372-SnapTripod2.webp' = (Join-Path $repoRoot 'ProductImages\Snap-on Tripod Wallet - 2.webp')
  '1775480026372-SnapTripod3.webp' = (Join-Path $repoRoot 'ProductImages\Snap-on Tripod Wallet - 3.webp')
  '1775480115554-Nano_Smart_Charger_-_1.webp' = (Join-Path $repoRoot 'ProductImages\Nano Smart Charger - 1.webp')
  '1775480115555-Nano_Smart_Charger_-_2.webp' = (Join-Path $repoRoot 'ProductImages\Nano Smart Charger - 2.webp')
  '1775480152192-Thunderbolt_4_Docking_Station_-3.webp' = (Join-Path $repoRoot 'ProductImages\Thunderbolt 4 Docking Station -3.webp')
  'Nothing+Phone+3a+Pro-1.webp' = (Join-Path $repoRoot 'ProductImages\Phone 3a Pro.jpg')
  'Nothing+Phone+3a+Pro-2.webp' = (Join-Path $repoRoot 'ProductImages\Phone 3a Pro.jpg')
  'T9SSD1.jpg' = (Join-Path $repoRoot 'ProductImages\T9 Portable External SSD - 1.jpg')
  'T9SSD2.jpg' = (Join-Path $repoRoot 'ProductImages\T9 Portable External SSD - 2.jpg')
  'Thunderbolt2.jpg' = (Join-Path $repoRoot 'ProductImages\Thunderbolt 4 Docking Station - 2.jpg')
  'Thunderbolt3.webp' = (Join-Path $repoRoot 'ProductImages\Thunderbolt 4 Docking Station -3.webp')
}

$products = Invoke-WebRequest -UseBasicParsing 'https://wf0kabz6g9.execute-api.us-east-1.amazonaws.com/prod/products' |
  Select-Object -ExpandProperty Content |
  ConvertFrom-Json

$keys = [System.Collections.Generic.HashSet[string]]::new()

foreach ($product in $products) {
  foreach ($image in @($product.imageUrl) + @($product.images)) {
    if ($image -and $image -like 'https://d38dfkkkqrdh6x.cloudfront.net/images/*') {
      $key = $image.Replace('https://d38dfkkkqrdh6x.cloudfront.net/images/', '')
      [void]$keys.Add($key)
    }
  }
}

$restored = New-Object System.Collections.Generic.List[string]
$failed = New-Object System.Collections.Generic.List[string]

Write-Host "Recovering $($keys.Count) image keys"

foreach ($key in $keys) {
  try {
    $localSource = $localMap[$key]

    if ($localSource -and (Test-Path $localSource)) {
      Write-Host "LOCAL  $key"
      aws s3 cp $localSource "s3://$bucket/images/$key" --region us-east-1 | Out-Null
      $restored.Add("$key <= local") | Out-Null
      continue
    }

    $sourceUrl = "$oldBase$key"
    $tempFile = Join-Path $tempDir ([IO.Path]::GetFileName($key))
    Write-Host "REMOTE $key"
    Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl -OutFile $tempFile
    aws s3 cp $tempFile "s3://$bucket/images/$key" --region us-east-1 | Out-Null
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    $restored.Add("$key <= old-bucket") | Out-Null
  } catch {
    $failed.Add($key) | Out-Null
    Write-Warning "Failed to restore $key: $($_.Exception.Message)"
  }
}

Write-Host ''
Write-Host 'Restored:'
$restored
Write-Host ''
Write-Host 'Failed:'
$failed