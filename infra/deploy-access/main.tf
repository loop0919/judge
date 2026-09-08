data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
locals {
  account = data.aws_caller_identity.current.account_id
  arn     = "arn:${data.aws_partition.current.partition}"
  execution_roles = [
    "${local.arn}:iam::${local.account}:role/${var.api_execution_role_name}",
    "${local.arn}:iam::${local.account}:role/${local.name}-web",
  ]
}
# Adopt the role created in the console; only this bootstrap stack manages its trust.
resource "aws_iam_role" "github_deploy" {
  name = "${local.name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = "${local.arn}:iam::${local.account}:oidc-provider/token.actions.githubusercontent.com" }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = var.github_subject
      } }
    }]
  })
  lifecycle { prevent_destroy = true }
}
resource "aws_iam_role_policy" "deploy" {
  name = "${local.name}-deploy"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StateBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = "${local.arn}:s3:::${var.state_bucket}"
      },
      {
        Sid      = "ApplicationState"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = [for app in ["api", "frontend"] : "${local.arn}:s3:::${var.state_bucket}/${var.project_name}/${var.environment}/${app}.tfstate"]
      },
      {
        Sid      = "ApplicationLocks"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [for app in ["api", "frontend"] : "${local.arn}:s3:::${var.state_bucket}/${var.project_name}/${var.environment}/${app}.tfstate.tflock"]
      },
      {
        Sid      = "ApplicationArtifacts"
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = flatten([for prefix in ["${local.name}-artifacts-", "${local.name}-web-artifacts-"] : ["${local.arn}:s3:::${prefix}*", "${local.arn}:s3:::${prefix}*/*"]])
      },
      {
        Sid      = "ApplicationFunctions"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = [for app in ["api", "web"] : "${local.arn}:lambda:${var.aws_region}:${local.account}:function:${local.name}-${app}*"]
      },
      {
        Sid      = "ApplicationLogs"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = [for service in ["lambda", "apigateway"] : "${local.arn}:logs:${var.aws_region}:${local.account}:log-group:/aws/${service}/${local.name}-*"]
      },
      {
        Sid      = "DescribeLogGroups"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "*"
      },
      {
        Sid      = "ExecutionRoles"
        Effect   = "Allow"
        Action   = ["iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy"]
        Resource = local.execution_roles
      },
      {
        Sid       = "PassExecutionRoleToLambda"
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = local.execution_roles
        Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } }
      },
      {
        Sid      = "ApplicationGateways"
        Effect   = "Allow"
        Action   = ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"]
        Resource = flatten([for id in var.gateway_ids : ["${local.arn}:apigateway:${var.aws_region}::/apis/${id}", "${local.arn}:apigateway:${var.aws_region}::/apis/${id}/*", "${local.arn}:apigateway:${var.aws_region}::/tags/${local.arn}:apigateway:${var.aws_region}::/apis/${id}"]])
      },
      {
        Sid      = "ApplicationUserPools"
        Effect   = "Allow"
        Action   = ["cognito-idp:GetUserPoolMfaConfig", "cognito-idp:SetUserPoolMfaConfig", "cognito-idp:DescribeUserPool", "cognito-idp:UpdateUserPool", "cognito-idp:DescribeUserPoolClient", "cognito-idp:CreateUserPoolClient", "cognito-idp:UpdateUserPoolClient", "cognito-idp:DeleteUserPoolClient", "cognito-idp:ListTagsForResource", "cognito-idp:TagResource", "cognito-idp:UntagResource"]
        Resource = [for id in var.user_pool_ids : "${local.arn}:cognito-idp:${var.aws_region}:${local.account}:userpool/${id}"]
      }
    ]
  })
}
output "deploy_role_arn" { value = aws_iam_role.github_deploy.arn }
