# Run from repository root: .\terraform\package-lambdas.ps1
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path "$base\.."
$src = "$projectRoot\lambda\functions"
$zipDir = "$base\packages"

if (-not (Test-Path $zipDir)) { New-Item -ItemType Directory -Path $zipDir | Out-Null }

$lambdas = @(
    @{name='get_products'; file='GetProductsHandler.js'},
    @{name='get_orders'; file='GetOrders.js'},
    @{name='process_order'; file='ProcessOrders.js'},
    @{name='stripe_webhook'; file='StripeWebhook.js'},
  @{name='order_fulfillment_processor'; file='OrderFulfillmentProcessor.js'},
  @{name='product_manager'; file='ProductManager.js'},
  @{name='admin_manager'; file='AdminManager.js'},
  @{name='user_profile'; file='UserProfile.js'},
  @{name='promo_lookup'; file='PromoLookup.js'},
  @{name='reviews'; file='Reviews.js'}
)

# Check if esbuild is available
$esbuild = Get-Command esbuild -ErrorAction SilentlyContinue
if (-not $esbuild) {
    Write-Host "esbuild not found. Installing globally..."
    npm install -g esbuild
}

foreach ($fn in $lambdas) {
    $temp = "$zipDir\tmp-$($fn.name)"
    if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
    New-Item -ItemType Directory -Path $temp | Out-Null

    # Create package.json for dependencies
    $packageJson = @"
{
  "name": "$($fn.name)",
  "version": "1.0.0",
  "type": "commonjs",
  "dependencies": {
    "stripe": "^14.0.0",
    "@aws-sdk/client-dynamodb": "^3.512.0",
    "@aws-sdk/lib-dynamodb": "^3.512.0",
    "@aws-sdk/client-s3": "^3.512.0",
    "@aws-sdk/client-ses": "^3.512.0",
    "@aws-sdk/client-sns": "^3.512.0",
    "@aws-sdk/client-sqs": "^3.512.0",
    "@aws-sdk/client-cognito-identity-provider": "^3.512.0"
  }
}
"@
    $packageJson | Out-File -FilePath "$temp\package.json" -Encoding ascii

    # Install dependencies
    Push-Location $temp
    npm install --production
    Pop-Location

    # Copy the handler file
    Copy-Item "$src\$($fn.file)" "$temp\index.js"

    $zipPath = "$zipDir\$($fn.name).zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($temp, $zipPath)

    Remove-Item -Recurse -Force $temp
    Write-Host "Created $zipPath"
}

Write-Host "Lambda packaging complete. You can now run terraform apply."