variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "stripe_secret_key" {
  description = "Stripe secret key for Checkout and webhook verification"
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "Your SPA production URL used for success/cancel redirects"
  type        = string
  default     = "https://example.com"
}

variable "ses_from_address" {
  description = "Verified source email for SES notifications"
  type        = string
  default     = "noreply@example.com"
}

variable "lambda_pkg_dir" {
  description = "Directory containing lambda packages"
  type        = string
  default     = "packages" # Removed ${path.module}/
}

variable "admin_email" {
  description = "Email for the default admin user"
  type        = string
  default     = "admin@electrotech.com"
}
