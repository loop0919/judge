variable "aws_region" {
  default = "ap-northeast-1"
}
variable "project_name" {
  default = "judge"
}
variable "environment" {
  default = "dev"
}
variable "domain_name" {
  default = "share-oj.net"
}
variable "frontend_api_id" {
  description = "Existing frontend HTTP API ID in aws_region."
  type        = string
}
variable "backend_api_id" {
  description = "Existing Go backend HTTP API ID in aws_region."
  type        = string
}
