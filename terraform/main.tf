locals {
  lambda_functions = {
    get_products    = "GetProductsHandler"
    get_orders      = "GetOrders"
    process_order   = "ProcessOrders"
    stripe_webhook  = "StripeWebhook"
    product_manager = "ProductManager"
    admin_manager   = "AdminManager"
    promo_lookup    = "PromoLookup"
    user_profile    = "UserProfile"
  }
}

resource "aws_dynamodb_table" "products" {
  name         = "Products"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "productId"

  attribute {
    name = "productId"
    type = "S"
  }

  ttl {
    enabled = false
  }
}

resource "null_resource" "seed_products" {
  depends_on = [aws_dynamodb_table.products, aws_cloudfront_distribution.frontend]

  triggers = {
    products_file = filemd5("${abspath(path.module)}/../src/Products.json")
    seed_script   = filemd5("${abspath(path.module)}/../scripts/seed-products.js")
  }

  provisioner "local-exec" {
    command = "node ${abspath(path.module)}/../scripts/seed-products.js --table ${aws_dynamodb_table.products.name} --file ${abspath(path.module)}/../src/Products.json --region ${var.aws_region} --cloudfront-url https://${aws_cloudfront_distribution.frontend.domain_name}"
  }
}

resource "aws_dynamodb_table" "orders" {
  name         = "Orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderId"
  range_key    = "createdAt"

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name               = "userId-index"
    hash_key           = "userId"
    range_key          = "createdAt"
    projection_type    = "ALL"
    write_capacity     = 0
    read_capacity      = 0
  }

  ttl {
    enabled = false
  }
}

resource "aws_dynamodb_table" "promo_codes" {
  name         = "PromoCodes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "code"

  attribute {
    name = "code"
    type = "S"
  }

  ttl {
    enabled = false
  }
}

resource "aws_dynamodb_table" "user_profiles" {
  name         = "UserProfiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  ttl {
    enabled = false
  }
}

resource "aws_iam_role" "lambda_exec" {
  name = "capstone-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "capstone-lambda-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.products.arn,
          aws_dynamodb_table.orders.arn,
          aws_dynamodb_table.promo_codes.arn,
          aws_dynamodb_table.user_profiles.arn,
          "${aws_dynamodb_table.orders.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:ListUsers"
        ]
        Resource = aws_cognito_user_pool.capstone_pool.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.frontend.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_ses_email_identity" "from_email" {
  email = var.ses_from_address
}

# ============ COGNITO USER POOL FOR ADMIN AUTHENTICATION ============
resource "aws_cognito_user_pool" "capstone_pool" {
  name = "electrotech-users"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  schema {
    attribute_data_type = "String"
    mutable             = false
    name                = "email"
    required            = true
  }

  auto_verified_attributes = ["email"]
  email_verification_message = "Your ElectroTech verification code is {####}"
  email_verification_subject = "ElectroTech Email Verification"
}

resource "aws_cognito_user_pool_client" "capstone_client" {
  name                 = "electrotech-app"
  user_pool_id         = aws_cognito_user_pool.capstone_pool.id
  explicit_auth_flows  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  generate_secret      = false

  allowed_oauth_flows            = ["code", "implicit"]
  allowed_oauth_scopes           = ["phone", "email", "openid", "profile"]
  allowed_oauth_flows_user_pool_client = true
  callback_urls                  = ["https://${aws_cloudfront_distribution.frontend.domain_name}/admin", "http://localhost:5173/admin"]
  logout_urls                    = ["https://${aws_cloudfront_distribution.frontend.domain_name}/logout", "http://localhost:5173/logout"]
}

# Create "Admins" group for ProductManager access
resource "aws_cognito_user_group" "admins" {
  name        = "Admins"
  user_pool_id = aws_cognito_user_pool.capstone_pool.id
  description = "Admin users with product management access"
}

# Generate random password for default admin
resource "random_password" "admin_password" {
  length           = 16
  special          = true
  override_special = "_%@"
  min_lower        = 1
  min_upper        = 1
  min_numeric      = 1
}

# Create default admin user
resource "aws_cognito_user" "default_admin" {
  user_pool_id = aws_cognito_user_pool.capstone_pool.id
  username     = var.admin_email
  password     = random_password.admin_password.result

  attributes = {
    email          = var.admin_email
    email_verified = true
  }
}

# Add admin user to Admins group
resource "aws_cognito_user_in_group" "admin_user" {
  user_pool_id = aws_cognito_user_pool.capstone_pool.id
  group_name  = aws_cognito_user_group.admins.name
  username    = aws_cognito_user.default_admin.username
}

# API Gateway Authorizer for Cognito
resource "aws_api_gateway_authorizer" "cognito" {
  name          = "cognito-authorizer"
  type          = "COGNITO_USER_POOLS"
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  provider_arns = [aws_cognito_user_pool.capstone_pool.arn]
}

resource "aws_s3_bucket" "frontend" {
  bucket = "electrotech-frontend-${random_id.bucket_suffix.hex}"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "OAI for ElectroTech frontend"
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.frontend.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })
}

resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-electrotech-frontend"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-electrotech-frontend"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Upload product images to S3 bucket
resource "null_resource" "upload_product_images" {
  depends_on = [aws_s3_bucket.frontend]

  triggers = {
    bucket_id   = aws_s3_bucket.frontend.id
    source_hash = sha256(join("", [for f in fileset("${path.module}/../ProductImages", "**") : filemd5("${path.module}/../ProductImages/${f}")]))
  }

  provisioner "local-exec" {
    command = "aws s3 sync ${abspath(path.module)}/../ProductImages s3://${aws_s3_bucket.frontend.bucket}/images --region ${var.aws_region}"
  }
}

# Build and upload frontend
resource "null_resource" "build_and_upload_frontend" {
  depends_on = [null_resource.upload_product_images, null_resource.seed_products]

  triggers = {
    bucket_id = aws_s3_bucket.frontend.id
    # Trigger on source changes
    source_hash = sha256(join("", [
      for f in fileset("${path.module}/../src", "**") : filemd5("${path.module}/../src/${f}")
    ]))
  }

  provisioner "local-exec" {
    environment = {
      API_URL = local.api_base
      CDN_URL = "https://${aws_cloudfront_distribution.frontend.domain_name}"
      COGNITO_REGION = var.aws_region
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.capstone_pool.id
      COGNITO_USER_POOL_CLIENT_ID = aws_cognito_user_pool_client.capstone_client.id
      COGNITO_DOMAIN = aws_cognito_user_pool.capstone_pool.endpoint
    }
    command = <<EOT
      cd ${abspath(path.module)}/..
      
      # Update app constants with deployment URLs using PowerShell
      powershell -Command "
        $content = Get-Content 'src/constants/appConstants.js' -Raw
        
        # Replace API_URL
        $content = $content -replace 'API_URL: import\.meta\.env\.VITE_API_URL \|\| ''[^'']*''', ('API_URL: ''' + $env:API_URL + '''')
        
        # Replace CDN_URL
        $content = $content -replace 'CDN_URL: import\.meta\.env\.VITE_CDN_URL \|\| ''[^'']*''', ('CDN_URL: ''' + $env:CDN_URL + '''')
        
        # Replace Cognito config
        $content = $content -replace 'REGION: import\.meta\.env\.VITE_COGNITO_REGION \|\| ''[^'']*''', ('REGION: ''' + $env:COGNITO_REGION + '''')
        $content = $content -replace 'USER_POOL_ID: import\.meta\.env\.VITE_COGNITO_USER_POOL_ID \|\| ''[^'']*''', ('USER_POOL_ID: ''' + $env:COGNITO_USER_POOL_ID + '''')
        $content = $content -replace 'USER_POOL_CLIENT_ID: import\.meta\.env\.VITE_COGNITO_USER_POOL_CLIENT_ID \|\| ''[^'']*''', ('USER_POOL_CLIENT_ID: ''' + $env:COGNITO_USER_POOL_CLIENT_ID + '''')
        $content = $content -replace 'DOMAIN: import\.meta\.env\.VITE_COGNITO_DOMAIN \|\| ''[^'']*''', ('DOMAIN: ''' + $env:COGNITO_DOMAIN + '''')
        
        Set-Content 'src/constants/appConstants.js' $content
        Write-Host 'Updated app constants with deployment URLs and Cognito config'
      "
      
      # Build the app
      npm run build
      
      # Upload to S3
      aws s3 sync dist s3://${aws_s3_bucket.frontend.bucket} --region ${var.aws_region}
    EOT
  }
}

resource "null_resource" "invalidate_frontend_cache" {
  depends_on = [null_resource.build_and_upload_frontend]

  triggers = {
    distribution_id = aws_cloudfront_distribution.frontend.id
    source_hash     = null_resource.build_and_upload_frontend.triggers.source_hash
  }

  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.frontend.id} --paths /* --no-cli-pager"
  }
}

resource "aws_lambda_function" "functions" {
  for_each = local.lambda_functions

  filename         = "${path.module}/${var.lambda_pkg_dir}/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/${var.lambda_pkg_dir}/${each.key}.zip")
  function_name    = each.value
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  role             = aws_iam_role.lambda_exec.arn

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = merge(
      {
        PRODUCTS_TABLE = aws_dynamodb_table.products.name
        ORDERS_TABLE   = aws_dynamodb_table.orders.name
        PROMO_CODES_TABLE  = aws_dynamodb_table.promo_codes.name
        USER_PROFILES_TABLE = aws_dynamodb_table.user_profiles.name
        FRONTEND_URL   = "https://${aws_cloudfront_distribution.frontend.domain_name}"
        CDN_URL        = "https://${aws_cloudfront_distribution.frontend.domain_name}"
        S3_BUCKET      = aws_s3_bucket.frontend.bucket
        SES_FROM_ADDRESS = var.ses_from_address
        STRIPE_SECRET_KEY = var.stripe_secret_key
        STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
        USER_POOL_ID = aws_cognito_user_pool.capstone_pool.id
        SUPERADMIN_EMAIL = var.admin_email
      },
      each.key == "get_products" ? {} : {},
      each.key == "get_orders" ? {} : {},
      each.key == "process_order" ? {} : {},
      each.key == "stripe_webhook" ? {} : {},
      each.key == "admin_manager" ? {} : {},
      each.key == "promo_lookup" ? {} : {},
      each.key == "user_profile" ? {} : {}
    )
  }

  depends_on = [aws_iam_role_policy.lambda_policy, aws_ses_email_identity.from_email]
}

resource "aws_api_gateway_rest_api" "capstone_api" {
  name        = "capstone-api"
  description = "API Gateway for ElectroTech capstone backend"
}

resource "aws_api_gateway_resource" "products" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "products"
}

resource "aws_api_gateway_resource" "orders" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "orders"
}

resource "aws_api_gateway_resource" "process_order" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "process-order"
}

resource "aws_api_gateway_resource" "webhook" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "webhook"
}

resource "aws_api_gateway_resource" "admin_data" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "admin-data"
}

resource "aws_api_gateway_resource" "profile" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "profile"
}

resource "aws_api_gateway_resource" "promos" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_rest_api.capstone_api.root_resource_id
  path_part   = "promos"
}

resource "aws_api_gateway_method" "products_get" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.products.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "products_get" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products.id
  http_method = aws_api_gateway_method.products_get.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["get_products"].invoke_arn
}

resource "aws_api_gateway_method" "orders_get" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.orders.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "orders_get" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.orders_get.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["get_orders"].invoke_arn
}

resource "aws_api_gateway_method" "orders_post" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.orders.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "orders_post" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.orders_post.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["get_orders"].invoke_arn
}

resource "aws_api_gateway_method" "process_order_post" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.process_order.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "process_order_post" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.process_order.id
  http_method = aws_api_gateway_method.process_order_post.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["process_order"].invoke_arn
}

resource "aws_api_gateway_method" "process_order_options" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.process_order.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "process_order_options" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.process_order.id
  http_method = aws_api_gateway_method.process_order_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "process_order_options_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.process_order.id
  http_method = aws_api_gateway_method.process_order_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "process_order_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.process_order.id
  http_method = aws_api_gateway_method.process_order_options.http_method
  status_code = aws_api_gateway_method_response.process_order_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }

  depends_on = [aws_api_gateway_integration.process_order_options]
}

resource "aws_api_gateway_method" "webhook_post" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.webhook.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "webhook_post" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.webhook.id
  http_method = aws_api_gateway_method.webhook_post.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["stripe_webhook"].invoke_arn
}

resource "aws_api_gateway_method" "admin_data_get" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.admin_data.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_data_get" {
  rest_api_id             = aws_api_gateway_rest_api.capstone_api.id
  resource_id             = aws_api_gateway_resource.admin_data.id
  http_method             = aws_api_gateway_method.admin_data_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.functions["admin_manager"].invoke_arn
}

resource "aws_api_gateway_method" "admin_data_post" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.admin_data.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_data_post" {
  rest_api_id             = aws_api_gateway_rest_api.capstone_api.id
  resource_id             = aws_api_gateway_resource.admin_data.id
  http_method             = aws_api_gateway_method.admin_data_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.functions["admin_manager"].invoke_arn
}

resource "aws_api_gateway_method" "profile_get" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.profile.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "profile_get" {
  rest_api_id             = aws_api_gateway_rest_api.capstone_api.id
  resource_id             = aws_api_gateway_resource.profile.id
  http_method             = aws_api_gateway_method.profile_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.functions["user_profile"].invoke_arn
}

resource "aws_api_gateway_method" "profile_put" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.profile.id
  http_method   = "PUT"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "profile_put" {
  rest_api_id             = aws_api_gateway_rest_api.capstone_api.id
  resource_id             = aws_api_gateway_resource.profile.id
  http_method             = aws_api_gateway_method.profile_put.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.functions["user_profile"].invoke_arn
}

resource "aws_api_gateway_method" "promos_get" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.promos.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "promos_get" {
  rest_api_id             = aws_api_gateway_rest_api.capstone_api.id
  resource_id             = aws_api_gateway_resource.promos.id
  http_method             = aws_api_gateway_method.promos_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.functions["promo_lookup"].invoke_arn
}

# ProductManager Routes: POST /products (create), PUT /products/{productId} (update), DELETE /products/{productId} (delete)
resource "aws_api_gateway_resource" "products_id" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  parent_id   = aws_api_gateway_resource.products.id
  path_part   = "{productId}"
}

resource "aws_api_gateway_method" "products_post" {
  rest_api_id      = aws_api_gateway_rest_api.capstone_api.id
  resource_id      = aws_api_gateway_resource.products.id
  http_method      = "POST"
  authorization    = "COGNITO_USER_POOLS"
  authorizer_id    = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "products_post" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products.id
  http_method = aws_api_gateway_method.products_post.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["product_manager"].invoke_arn
}

resource "aws_api_gateway_method" "products_put" {
  rest_api_id      = aws_api_gateway_rest_api.capstone_api.id
  resource_id      = aws_api_gateway_resource.products_id.id
  http_method      = "PUT"
  authorization    = "COGNITO_USER_POOLS"
  authorizer_id    = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "products_put" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products_id.id
  http_method = aws_api_gateway_method.products_put.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["product_manager"].invoke_arn
}

resource "aws_api_gateway_method" "products_delete" {
  rest_api_id      = aws_api_gateway_rest_api.capstone_api.id
  resource_id      = aws_api_gateway_resource.products_id.id
  http_method      = "DELETE"
  authorization    = "COGNITO_USER_POOLS"
  authorizer_id    = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "products_delete" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products_id.id
  http_method = aws_api_gateway_method.products_delete.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.functions["product_manager"].invoke_arn
}

# ============ CORS SUPPORT ============

# OPTIONS method for CORS preflight on products
resource "aws_api_gateway_method" "products_options" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.products.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# Mock integration for OPTIONS
resource "aws_api_gateway_integration" "products_options" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products.id
  http_method = aws_api_gateway_method.products_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Method response for OPTIONS
resource "aws_api_gateway_method_response" "products_options_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products.id
  http_method = aws_api_gateway_method.products_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

# Integration response for OPTIONS
resource "aws_api_gateway_integration_response" "products_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.products.id
  http_method = aws_api_gateway_method.products_options.http_method
  status_code = aws_api_gateway_method_response.products_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }

  depends_on = [aws_api_gateway_integration.products_options]
}

resource "aws_api_gateway_method" "orders_options" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.orders.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "orders_options" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.orders_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "orders_options_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.orders_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "orders_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.orders_options.http_method
  status_code = aws_api_gateway_method_response.orders_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }

  depends_on = [aws_api_gateway_integration.orders_options]
}

resource "aws_api_gateway_method" "admin_data_options" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.admin_data.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_data_options" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.admin_data.id
  http_method = aws_api_gateway_method.admin_data_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_data_options_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.admin_data.id
  http_method = aws_api_gateway_method.admin_data_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "admin_data_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.admin_data.id
  http_method = aws_api_gateway_method.admin_data_options.http_method
  status_code = aws_api_gateway_method_response.admin_data_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }

  depends_on = [aws_api_gateway_integration.admin_data_options]
}

resource "aws_api_gateway_method" "profile_options" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.profile.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "profile_options" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.profile.id
  http_method = aws_api_gateway_method.profile_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "profile_options_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.profile.id
  http_method = aws_api_gateway_method.profile_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "profile_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.profile.id
  http_method = aws_api_gateway_method.profile_options.http_method
  status_code = aws_api_gateway_method_response.profile_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,PUT,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }

  depends_on = [aws_api_gateway_integration.profile_options]
}

resource "aws_api_gateway_method" "promos_options" {
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  resource_id   = aws_api_gateway_resource.promos.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "promos_options" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.promos.id
  http_method = aws_api_gateway_method.promos_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "promos_options_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.promos.id
  http_method = aws_api_gateway_method.promos_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "promos_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  resource_id = aws_api_gateway_resource.promos.id
  http_method = aws_api_gateway_method.promos_options.http_method
  status_code = aws_api_gateway_method_response.promos_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  response_templates = {
    "application/json" = ""
  }

  depends_on = [aws_api_gateway_integration.promos_options]
}

resource "aws_api_gateway_deployment" "capstone_api_deploy" {
  depends_on = [
    aws_api_gateway_integration.products_get,
    aws_api_gateway_integration.products_post,
    aws_api_gateway_integration.products_put,
    aws_api_gateway_integration.products_delete,
    aws_api_gateway_integration.products_options,
    aws_api_gateway_integration.orders_get,
    aws_api_gateway_integration.orders_post,
    aws_api_gateway_integration.orders_options,
    aws_api_gateway_integration.process_order_post,
    aws_api_gateway_integration.process_order_options,
    aws_api_gateway_integration.webhook_post,
    aws_api_gateway_integration.admin_data_get,
    aws_api_gateway_integration.admin_data_post,
    aws_api_gateway_integration.admin_data_options,
    aws_api_gateway_integration.profile_get,
    aws_api_gateway_integration.profile_put,
    aws_api_gateway_integration.profile_options,
    aws_api_gateway_integration.promos_get,
    aws_api_gateway_integration.promos_options,
    aws_api_gateway_integration_response.products_options_integration_response,
    aws_api_gateway_integration_response.orders_options_integration_response,
    aws_api_gateway_integration_response.process_order_options_integration_response,
    aws_api_gateway_integration_response.admin_data_options_integration_response,
    aws_api_gateway_integration_response.profile_options_integration_response,
    aws_api_gateway_integration_response.promos_options_integration_response
  ]

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.products.id,
      aws_api_gateway_resource.products_id.id,
      aws_api_gateway_resource.orders.id,
      aws_api_gateway_resource.process_order.id,
      aws_api_gateway_resource.webhook.id,
      aws_api_gateway_resource.admin_data.id,
      aws_api_gateway_resource.profile.id,
      aws_api_gateway_resource.promos.id,
      aws_api_gateway_method.products_get.id,
      aws_api_gateway_method.products_post.id,
      aws_api_gateway_method.products_put.id,
      aws_api_gateway_method.products_delete.id,
      aws_api_gateway_method.products_options.id,
      aws_api_gateway_method.orders_get.id,
      aws_api_gateway_method.orders_post.id,
      aws_api_gateway_method.orders_options.id,
      aws_api_gateway_method.process_order_post.id,
      aws_api_gateway_method.process_order_options.id,
      aws_api_gateway_method.webhook_post.id,
      aws_api_gateway_method.admin_data_get.id,
      aws_api_gateway_method.admin_data_post.id,
      aws_api_gateway_method.admin_data_options.id,
      aws_api_gateway_method.profile_get.id,
      aws_api_gateway_method.profile_put.id,
      aws_api_gateway_method.profile_options.id,
      aws_api_gateway_method.promos_get.id,
      aws_api_gateway_method.promos_options.id,
      aws_api_gateway_integration.products_get.id,
      aws_api_gateway_integration.products_post.id,
      aws_api_gateway_integration.products_put.id,
      aws_api_gateway_integration.products_delete.id,
      aws_api_gateway_integration.products_options.id,
      aws_api_gateway_integration.orders_get.id,
      aws_api_gateway_integration.orders_post.id,
      aws_api_gateway_integration.orders_options.id,
      aws_api_gateway_integration.process_order_post.id,
      aws_api_gateway_integration.process_order_options.id,
      aws_api_gateway_integration.webhook_post.id,
      aws_api_gateway_integration.admin_data_get.id,
      aws_api_gateway_integration.admin_data_post.id,
      aws_api_gateway_integration.admin_data_options.id,
      aws_api_gateway_integration.profile_get.id,
      aws_api_gateway_integration.profile_put.id,
      aws_api_gateway_integration.profile_options.id,
      aws_api_gateway_integration.promos_get.id,
      aws_api_gateway_integration.promos_options.id,
      aws_api_gateway_integration_response.products_options_integration_response.id,
      aws_api_gateway_integration_response.orders_options_integration_response.id,
      aws_api_gateway_integration_response.process_order_options_integration_response.id,
      aws_api_gateway_integration_response.admin_data_options_integration_response.id,
      aws_api_gateway_integration_response.profile_options_integration_response.id,
      aws_api_gateway_integration_response.promos_options_integration_response.id
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
}

resource "aws_cloudwatch_log_group" "api_gateway_access" {
  name              = "/aws/apigateway/capstone-api-prod"
  retention_in_days = 14
}

resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "capstone-apigateway-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "capstone" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.capstone_api_deploy.id
  rest_api_id   = aws_api_gateway_rest_api.capstone_api.id
  stage_name    = "prod"
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
      traceId        = "$context.xrayTraceId"
    })
  }

  depends_on = [
    aws_api_gateway_account.capstone,
    aws_cloudwatch_log_group.api_gateway_access
  ]
}

resource "aws_api_gateway_method_settings" "prod_all" {
  rest_api_id = aws_api_gateway_rest_api.capstone_api.id
  stage_name  = aws_api_gateway_stage.prod.stage_name
  method_path = "*/*"

  settings {
    logging_level      = "INFO"
    metrics_enabled    = true
    data_trace_enabled = true
  }
}

resource "aws_lambda_permission" "api_gateway_products" {
  statement_id  = "lambda-perm-products"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["get_products"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/GET/products"
}

resource "aws_lambda_permission" "api_gateway_orders" {
  statement_id  = "lambda-perm-orders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["get_orders"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/GET/orders"
}

resource "aws_lambda_permission" "api_gateway_orders_post" {
  statement_id  = "lambda-perm-orders-post"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["get_orders"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/POST/orders"
}

resource "aws_lambda_permission" "api_gateway_process_order" {
  statement_id  = "lambda-perm-process-order"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["process_order"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/POST/process-order"
}

resource "aws_lambda_permission" "api_gateway_webhook" {
  statement_id  = "lambda-perm-webhook"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["stripe_webhook"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/POST/webhook"
}

resource "aws_lambda_permission" "api_gateway_product_manager_post" {
  statement_id  = "lambda-perm-product-manager-post"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["product_manager"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/POST/products"
}

resource "aws_lambda_permission" "api_gateway_product_manager_put" {
  statement_id  = "lambda-perm-product-manager-put"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["product_manager"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/PUT/products/*"
}

resource "aws_lambda_permission" "api_gateway_product_manager_delete" {
  statement_id  = "lambda-perm-product-manager-delete"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["product_manager"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/DELETE/products/*"
}

resource "aws_lambda_permission" "api_gateway_admin_data_get" {
  statement_id  = "lambda-perm-admin-data-get"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["admin_manager"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/GET/admin-data"
}

resource "aws_lambda_permission" "api_gateway_admin_data_post" {
  statement_id  = "lambda-perm-admin-data-post"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["admin_manager"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/POST/admin-data"
}

resource "aws_lambda_permission" "api_gateway_profile_get" {
  statement_id  = "lambda-perm-profile-get"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["user_profile"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/GET/profile"
}

resource "aws_lambda_permission" "api_gateway_profile_put" {
  statement_id  = "lambda-perm-profile-put"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["user_profile"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/PUT/profile"
}

resource "aws_lambda_permission" "api_gateway_promos_get" {
  statement_id  = "lambda-perm-promos-get"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["promo_lookup"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.capstone_api.execution_arn}/*/GET/promos"
}
