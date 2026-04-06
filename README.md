# ElectroTech Capstone

ElectroTech is a React + Vite storefront backed by AWS Lambda, API Gateway, DynamoDB, Cognito, S3, CloudFront, SES, and Stripe.

## Local app

```powershell
npm install
npm run dev
```

## Terraform deployment

The AWS deployment instructions live in `terraform/README.md`.

Before your first `terraform apply`, have these values ready:
- Stripe secret key
- Stripe webhook signing secret
- SES verified sender email

Then run:

```powershell
Set-Location .\terraform
powershell -File .\setup-terraform.ps1
```

That setup script works from any drive where the repo is cloned, prompts for the required deployment values, and writes them into `terraform.tfvars` for Terraform to use. The frontend URL is provisioned by Terraform from CloudFront during apply.
