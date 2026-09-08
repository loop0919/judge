override_resource {
  target = aws_iam_role.github_deploy
  values = { arn = "arn:aws:iam::123456789012:role/judge-dev-github-deploy" }
}
mock_provider "aws" {
  mock_data "aws_caller_identity" { defaults = { account_id = "123456789012" } }
  mock_data "aws_partition" { defaults = { partition = "aws" } }
  mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::123456789012:role/judge-dev-github-deploy" } }
}
variables {
  state_bucket            = "example-state"
  github_subject          = "repo:owner@123/project@456:environment:dev"
  api_execution_role_name = "example-api"
  gateway_ids             = ["example"]
  user_pool_ids           = ["ap-northeast-1_example"]
}
run "deployment_boundary" {
  command = plan
  assert {
    condition     = jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == var.github_subject
    error_message = "Trust must match the exact immutable repository and environment subject."
  }
  assert {
    condition     = alltrue([for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement : !contains(statement.Action, "iam:*")]) && !contains(local.execution_roles, "arn:aws:iam::123456789012:role/judge-dev-github-deploy")
    error_message = "The deployment role must not grant itself IAM permissions."
  }
}
run "reject_wildcard_subject" {
  command = plan
  variables { github_subject = "repo:owner/*:environment:dev" }
  expect_failures = [var.github_subject]
}
