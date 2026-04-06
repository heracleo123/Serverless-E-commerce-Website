locals {
  api_base = "https://${aws_api_gateway_rest_api.capstone_api.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.prod.stage_name}/"
}

output "api_invoke_url" {
  description = "API invoke URL for frontend"
  value       = local.api_base
}

output "orders_api_url" {
  description = "Orders endpoint"
  value       = "${local.api_base}orders"
}

output "products_api_url" {
  description = "Products endpoint"
  value       = "${local.api_base}products"
}

output "process_order_api_url" {
  description = "Process order endpoint"
  value       = "${local.api_base}process-order"
}

output "webhook_api_url" {
  description = "Stripe webhook endpoint"
  value       = "${local.api_base}webhook"
}

output "cloudfront_url" {
  description = "CloudFront distribution URL for frontend"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "s3_bucket_name" {
  description = "S3 bucket for frontend assets"
  value       = aws_s3_bucket.frontend.bucket
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for admin authentication"
  value       = aws_cognito_user_pool.capstone_pool.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID for frontend"
  value       = aws_cognito_user_pool_client.capstone_client.id
}

output "cognito_user_pool_endpoint" {
  description = "Cognito User Pool endpoint for authentication"
  value       = aws_cognito_user_pool.capstone_pool.endpoint
}

output "admin_username" {
  description = "Default admin username"
  value       = aws_cognito_user.default_admin.username
}

output "admin_password" {
  description = "Default admin password (randomly generated)"
  value       = random_password.admin_password.result
  sensitive   = true
}
