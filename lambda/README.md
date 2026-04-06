# Lambda Functions

Backend serverless functions for the ElectroTech application deployed on AWS Lambda.

## Structure

```
lambda/
├── functions/          # Individual Lambda handler functions
│   ├── GetProductsHandler.js    # GET /products endpoint
│   ├── GetOrders.js              # GET /orders endpoint (authenticated)
│   ├── ProcessOrders.js           # POST /process-order Stripe checkout
│   ├── StripeWebhook.js           # Stripe webhook for payment confirmation
│   └── ProductManager.js          # CRUD operations for products (admin only)
├── shared/            # Shared utilities and middleware
└── package.json       # Lambda dependencies
```

## Functions

### GetProductsHandler.js
- **Method**: GET
- **Endpoint**: `/products`
- **Auth**: None
- **Description**: Fetches all products from DynamoDB and returns as JSON

### GetOrders.js
- **Method**: GET
- **Endpoint**: `/orders`
- **Auth**: Cognito (user must be authenticated)
- **Description**: Retrieves orders for the authenticated user using their user ID from Cognito

### ProcessOrders.js
- **Method**: POST
- **Endpoint**: `/process-order`
- **Auth**: Cognito (user must be authenticated)
- **Description**: Creates a Stripe Checkout session and returns payment URL

### StripeWebhook.js
- **Method**: POST
- **Endpoint**: `/webhook`
- **Auth**: Stripe signature verification
- **Description**: Handles Stripe payment completion webhook and saves order to DynamoDB

### ProductManager.js
- **Method**: GET, POST, PUT, DELETE
- **Endpoint**: `/products`
- **Auth**: Cognito + Admin group required
- **Description**: CRUD operations for product management (admin dashboard)

## Deployment

Lambda functions are packaged and deployed via Terraform. See `terraform/` for deployment configuration.

Each function is deployed to `packages/{function-name}.zip` and uploaded to AWS Lambda.
