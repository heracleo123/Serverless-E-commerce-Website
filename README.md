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
- Frontend URL
- SES verified sender email

Then run:

```powershell
cd c:\Users\mrelb\CAA900-Capstone\terraform
powershell .\setup-terraform.ps1
```

That setup script prompts for the required deployment values once and writes them into `terraform.tfvars` for Terraform to use.
