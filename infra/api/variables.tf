variable "project_name" {
  type    = string
  default = "judge"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,30}$", var.project_name))
    error_message = "Use a lowercase letter followed by up to 30 lowercase letters, digits, or hyphens."
  }
}
variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,15}$", var.environment))
    error_message = "Use a lowercase letter followed by up to 15 lowercase letters, digits, or hyphens."
  }
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "lambda_memory_size" {
  type    = number
  default = 256
  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240 && floor(var.lambda_memory_size) == var.lambda_memory_size
    error_message = "Lambda memory must be an integer between 128 and 10240 MiB."
  }
}

variable "log_retention_days" {
  type    = number
  default = 14
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "Choose a supported CloudWatch Logs retention period."
  }
}

variable "throttling_burst_limit" {
  type    = number
  default = 20
  validation {
    condition     = var.throttling_burst_limit >= 1 && floor(var.throttling_burst_limit) == var.throttling_burst_limit
    error_message = "Burst limit must be a positive integer."
  }
}

variable "throttling_rate_limit" {
  type    = number
  default = 10
  validation {
    condition     = var.throttling_rate_limit >= 1
    error_message = "Rate limit must be at least 1 request per second."
  }
}

variable "lambda_package_path" {
  description = "Optional ZIP path relative to this root module, or an absolute path. Build it before planning."
  type        = string
  default     = null
  nullable    = true
}

variable "existing_google_domain" {
  description = "Optional stable Cognito domain prefix. Import pre-existing resources into state separately before planning."
  type        = string
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth web client ID; leave empty to use email signup only."
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth secret supplied by the dev environment secret."
  type        = string
  sensitive   = true
  default     = ""
  validation {
    condition     = (var.google_client_id == "") == (var.google_client_secret == "")
    error_message = "Configure both Google OAuth client ID and secret, or neither."
  }
}

variable "public_site_url" {
  description = "Deployed HTTPS frontend origin, required when enabling Google OAuth."
  type        = string
  default     = ""
  validation {
    condition     = var.public_site_url == "" ? var.google_client_id == "" : can(regex("^https://[a-zA-Z0-9.-]+$", var.public_site_url))
    error_message = "Supply the frontend HTTPS origin without a trailing slash when enabling Google OAuth."
  }
}

variable "operator_subjects" {
  description = "Comma-separated Cognito sub values allowed to display the operator badge."
  type        = string
  default     = ""
}

variable "judge_runtime_digest" {
  description = "Empty disables submissions. Set the tested Lightsail isolate runtime manifest digest to enable C++17."
  type        = string
  default     = ""
  validation {
    condition     = var.judge_runtime_digest == "" || can(regex("^sha256:[a-f0-9]{64}$", var.judge_runtime_digest))
    error_message = "Use the sha256 runtime manifest digest or an empty string."
  }
}
