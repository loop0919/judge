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
