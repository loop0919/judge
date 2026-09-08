variable "project_name" {
  type    = string
  default = "judge"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,19}$", var.project_name))
    error_message = "Use 2–20 lowercase letters, digits, or hyphens."
  }
}
variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "stage", "prod"], var.environment)
    error_message = "Choose dev, stage, or prod."
  }
}
variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}
variable "api_endpoint" {
  description = "Go API HTTPS origin, without a trailing slash."
  type        = string
  validation {
    condition     = can(regex("^https://[a-zA-Z0-9.-]+$", var.api_endpoint))
    error_message = "Provide an HTTPS origin without a path."
  }
}
variable "lambda_package_path" {
  type     = string
  default  = null
  nullable = true
}
