$ErrorActionPreference = 'Stop'

param(
    [string]$TerraformDirectory = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$scriptDir = (Resolve-Path $TerraformDirectory).Path
$tfvarsPath = Join-Path $scriptDir 'terraform.tfvars'
$templatePath = Join-Path $scriptDir 'terraform.tfvars.example'

function Read-RequiredValue {
    param(
        [string]$Prompt,
        [string]$Default = ''
    )

    while ($true) {
        if ($Default) {
            $value = Read-Host "$Prompt [$Default]"
            if ([string]::IsNullOrWhiteSpace($value)) {
                $value = $Default
            }
        }
        else {
            $value = Read-Host $Prompt
        }

        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }

        Write-Host 'A value is required.' -ForegroundColor Yellow
    }
}

Write-Host 'ElectroTech Terraform setup' -ForegroundColor Cyan
Write-Host 'This will create or overwrite terraform.tfvars.' -ForegroundColor Yellow
Write-Host "Terraform directory: $scriptDir" -ForegroundColor DarkGray
Write-Host ''

if ((Test-Path $tfvarsPath) -and -not (Test-Path $templatePath)) {
    Write-Host 'terraform.tfvars already exists and no example template was found.' -ForegroundColor Yellow
}

$awsRegion = Read-RequiredValue 'AWS region' 'us-east-1'
$sesFromAddress = Read-RequiredValue 'SES verified sender email (personal email is fine for setup)'
$lambdaPackageDir = Read-RequiredValue 'Lambda package directory' 'packages'
$adminEmail = Read-RequiredValue 'Default admin email'
$stripeSecretKey = Read-RequiredValue 'Stripe secret key'
$stripeWebhookSecret = Read-RequiredValue 'Stripe webhook signing secret'

$tfvarsContent = @"
aws_region             = "$awsRegion"
ses_from_address       = "$sesFromAddress"
lambda_pkg_dir         = "$lambdaPackageDir"
admin_email            = "$adminEmail"
stripe_secret_key      = "$stripeSecretKey"
stripe_webhook_secret  = "$stripeWebhookSecret"
"@

Set-Content -Path $tfvarsPath -Value $tfvarsContent -Encoding ascii

Write-Host ''
Write-Host "Wrote $tfvarsPath" -ForegroundColor Green
Write-Host 'Terraform will provision the CloudFront frontend URL during apply, so no frontend URL is required during setup.' -ForegroundColor Green
Write-Host 'Review the file, then run terraform init and terraform apply from this Terraform directory.' -ForegroundColor Green
