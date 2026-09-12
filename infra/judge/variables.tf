variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}
variable "project_name" {
  type    = string
  default = "judge"
}
variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "stage", "prod"], var.environment)
    error_message = "environment must be dev, stage or prod."
  }
}
variable "availability_zone" {
  type    = string
  default = "ap-northeast-1a"
}
variable "ssh_public_key" {
  description = "Operator SSH public key; private keys are never stored in Terraform."
  type        = string
}
variable "admin_ipv6_cidr" {
  description = "Operator's IPv6 /128 address for SSH. IPv6 connectivity is required."
  type        = string
  validation {
    condition     = can(cidrhost(var.admin_ipv6_cidr, 0)) && endswith(var.admin_ipv6_cidr, "/128") && strcontains(var.admin_ipv6_cidr, ":")
    error_message = "Specify one operator IPv6 address with /128."
  }
}
variable "ssh_enabled" {
  description = "Bootstrap/recovery SSH from admin_ipv6_cidr. Disable after SSM connectivity and reboot verification."
  type        = bool
  default     = true
}
variable "bridge_package_path" {
  type    = string
  default = "../../api/.build/judge-bridge.zip"
}
variable "runtime_digest" {
  description = "Digest printed by install.sh on the worker after installing and fingerprinting the runtime. Empty until installation."
  type        = string
  default     = ""
  validation {
    condition     = var.runtime_digest == "" || can(regex("^sha256:[a-f0-9]{64}$", var.runtime_digest))
    error_message = "runtime_digest must be sha256 followed by 64 hex characters."
  }
}
variable "database" {
  description = "infra/api judge_bridge_database output. Used only by the bridge Lambda."
  type = object({
    host              = string
    name              = string
    secret_arn        = string
    subnet_ids        = list(string)
    security_group_id = string
  })
}
variable "test_data_bucket" {
  description = "infra/api test_data_bucket output. The worker can only read immutable versions."
  type = object({
    id  = string
    arn = string
  })
  default  = null
  nullable = true
}
variable "enabled" {
  description = "Start dispatcher after migrations and Lightsail smoke tests pass."
  type        = bool
  default     = false
}
