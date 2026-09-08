provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project_name
      Service     = var.project_name
      Environment = title(var.environment)
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  name = "${var.project_name}-${var.environment}"
}
