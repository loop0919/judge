data "aws_availability_zones" "available" { state = "available" }

resource "aws_vpc" "web" {
  cidr_block           = "10.43.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-web" }
}
resource "aws_subnet" "web" {
  count             = 2
  vpc_id            = aws_vpc.web.id
  cidr_block        = cidrsubnet(aws_vpc.web.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${local.name}-web-private-${count.index}" }
}
resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "Cache Lambda: Valkey only"
  vpc_id      = aws_vpc.web.id
}
resource "aws_security_group" "cache" {
  name        = "${local.name}-profile-cache"
  description = "Private profile cache reachable only from frontend Lambda"
  vpc_id      = aws_vpc.web.id
}
resource "aws_vpc_security_group_egress_rule" "web_cache" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.cache.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}
resource "aws_vpc_security_group_ingress_rule" "cache" {
  security_group_id            = aws_security_group.cache.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}
resource "aws_elasticache_serverless_cache" "profiles" {
  engine             = "valkey"
  name               = "${local.name}-profiles"
  description        = "Public external profile lookups, five minute TTL"
  subnet_ids         = aws_subnet.web[*].id
  security_group_ids = [aws_security_group.cache.id]
  cache_usage_limits {
    data_storage {
      maximum = 1
      unit    = "GB"
    }
    ecpu_per_second { maximum = 1000 }
  }
}
resource "aws_iam_role_policy" "web_vpc" {
  name = "vpc-network-interfaces"
  role = aws_iam_role.cache.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DescribeSubnets", "ec2:DeleteNetworkInterface", "ec2:AssignPrivateIpAddresses", "ec2:UnassignPrivateIpAddresses"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role" "cache" {
  name = "${local.name}-web-cache"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_cloudwatch_log_group" "cache" {
  name              = "/aws/lambda/${local.name}-web-cache"
  retention_in_days = 14
}
resource "aws_iam_role_policy" "cache_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.cache.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.cache.arn}:*" }]
  })
}
# Invoked directly with IAM. No public URL, internet route, or NAT is needed.
resource "aws_lambda_function" "cache" {
  function_name     = "${local.name}-web-cache"
  description       = "Private Valkey access for public profile cache"
  runtime           = "nodejs22.x"
  handler           = "server/profile-cache.handler"
  architectures     = ["arm64"]
  memory_size       = 128
  timeout           = 8
  role              = aws_iam_role.cache.arn
  s3_bucket         = aws_s3_object.web_package.bucket
  s3_key            = aws_s3_object.web_package.key
  s3_object_version = aws_s3_object.web_package.version_id
  source_code_hash  = filebase64sha256(local.lambda_package_path)
  vpc_config {
    subnet_ids         = aws_subnet.web[*].id
    security_group_ids = [aws_security_group.web.id]
  }
  environment {
    variables = { PROFILE_CACHE_URL = "rediss://${aws_elasticache_serverless_cache.profiles.endpoint[0].address}:${aws_elasticache_serverless_cache.profiles.endpoint[0].port}" }
  }
  depends_on = [aws_iam_role_policy.web_vpc, aws_iam_role_policy.cache_logs]
}
resource "aws_iam_role_policy" "invoke_cache" {
  name = "invoke-profile-cache"
  role = aws_iam_role.web.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.cache.arn }]
  })
}
