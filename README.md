# ElectroTech Capstone

ElectroTech is a full-stack e-commerce capstone built with React and Vite on the frontend and an AWS serverless backend provisioned through Terraform. The application supports product browsing, secure checkout with Stripe, profile management, reviews, promo codes, admin order management, refund handling, and status-based customer notifications.

## Provisioned AWS Services

- Amazon CloudFront serves the production frontend globally.
- Amazon S3 stores the built frontend, product media, and uploaded profile photos.
- Amazon API Gateway exposes the public and admin REST endpoints.
- AWS Lambda powers product retrieval, checkout session creation, Stripe webhooks, queued order fulfillment, profile management, reviews, promos, and admin workflows.
- Amazon DynamoDB stores products, orders, promo codes, user profiles, and product reviews.
- Amazon Cognito handles authentication and admin authorization.
- Amazon SQS now buffers Stripe fulfillment events, with a dead-letter queue for failed messages that need investigation.
- Amazon SES sends order confirmation and status-update emails.
- Amazon SNS sends optional SMS order confirmations.
- AWS X-Ray and CloudWatch provide tracing, logs, and API/Lambda observability.

## Capabilities

- Customer storefront with category browsing, cart management, and checkout review.
- Stripe-powered checkout with verified webhook processing.
- Queue-backed order fulfillment flow with retry protection and DLQ safety.
- Inventory reservation and restocking during order lifecycle changes.
- Admin dashboard for inventory, users, orders, promos, shipping updates, and cancellations.
- Review system with verified-purchase identity and profile photo support.
- Customer profile management with addresses, birthdate validation, display name, and profile photo upload.
- Friendly status emails with tracking and refund references when applicable.

## Local Development

```powershell
npm install
npm run dev
```

```powershell
npm run build
```

## Terraform Deployment

The AWS deployment setup lives in [terraform/README.md](c:\Users\mrelb\CAA900-Capstone\terraform\README.md).

Before your first apply, have these values ready:
- Stripe secret key
- Stripe webhook signing secret
- SES verified sender email

Bootstrap Terraform variables with:

```powershell
Set-Location .\terraform
powershell -File .\setup-terraform.ps1
```

Package Lambda artifacts and deploy with:

```powershell
Set-Location .\terraform
.\package-lambdas.ps1
terraform apply -auto-approve
```

The CloudFront URL, API URL, Cognito configuration, queues, tables, and Lambda environment variables are all provisioned by Terraform.
