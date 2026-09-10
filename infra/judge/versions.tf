terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.42, < 7.0"
    }
  }
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
