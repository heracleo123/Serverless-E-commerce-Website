# Terraform deployment for ElectroTech Capstone

This folder contains the AWS infrastructure code for your capstone project.
It deploys:
- DynamoDB tables: `Products`, `Orders` (with GSI `userId-index`)
- IAM role + policy for Lambda access
- Lambda functions for GetProducts, GetOrders, ProcessOrder, StripeWebhook
- API Gateway routes (products, orders, process-order, webhook)
- SES identity for from-address

## Prerequisites
- AWS CLI configured (`aws configure`) for your account/region
- Terraform v1.3+ installed
- `node`/`npm` installed in the repo root
- Your Stripe secret key and Stripe webhook signing secret ready before first deploy

## Before running
1. Run `npm install` in the repository root so the build and packaging steps have their dependencies.
2. Generate `terraform.tfvars` with the setup script.
3. Build/package each Lambda function.
4. Place zipped bundles in `terraform/packages`:
   - `get_products.zip`
   - `get_orders.zip`
   - `process_order.zip`
   - `stripe_webhook.zip`

Run the setup script once per environment:

```powershell
cd c:\Users\mrelb\CAA900-Capstone\terraform
powershell .\setup-terraform.ps1
```

The script prompts for the required deployment values and writes them to `terraform.tfvars`.

You can use the helper script:
```powershell
cd c:\Users\mrelb\CAA900-Capstone\terraform
powershell .\package-lambdas.ps1
```

> Note: If you depend on external npm modules (`@aws-sdk`, `stripe`), produce bundles with those deps included.

## Terraform workflow
```powershell
cd c:\Users\mrelb\CAA900-Capstone\terraform
terraform init
terraform fmt
terraform validate
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

## Variables
The recommended flow is to keep deployment values in `terraform.tfvars`. Start from `terraform.tfvars.example` or let `setup-terraform.ps1` create the file for you.

Example `terraform.tfvars`:
```hcl
aws_region            = "us-east-1"
stripe_secret_key     = "sk_live_xxx"
stripe_webhook_secret = "whsec_xxx"
frontend_url          = "https://your-app.example.com"
ses_from_address      = "verified@yourdomain.com"
lambda_pkg_dir        = "packages"
admin_email           = "admin@example.com"
```

> Note: `terraform.tfvars` is gitignored—never commit sensitive values.

## After deploy
- Check output URLs:
  - `api_invoke_url`
  - `products_api_url`
  - `orders_api_url`
  - `process_order_api_url`
  - `webhook_api_url`
- Set your frontend config to use these endpoints.
- Verify SES identity is verified in AWS SES console.
- Create Stripe webhook endpoint in Stripe dashboard using `webhook_api_url`.

## Cleanup
```powershell
terraform destroy
```

## Troubleshooting
- `401/403` in API: ensure Lambda permissions and API Gateway deployment are updated with `terraform apply`.
- `Checkout failed` with `StripeAuthenticationError`: confirm `stripe_secret_key` in `terraform.tfvars` is a real Stripe key, then redeploy.
- `Invalid webhook signature`: confirm `STRIPE_WEBHOOK_SECRET` matches Stripe setting.
- `SES Sending paused`: verify sender email and has production access in SES.
