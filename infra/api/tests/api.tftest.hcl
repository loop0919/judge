mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::judge-test-artifacts" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-northeast-1:123456789012:log-group:test" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/test" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { invoke_arn = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:test/invocations" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { execution_arn = "arn:aws:execute-api:ap-northeast-1:123456789012:test" }
  }
}

run "api_contract" {
  command = apply

  assert {
    condition = (
      aws_lambda_function.api.runtime == "provided.al2023" &&
      aws_lambda_function.api.architectures == tolist(["arm64"]) &&
      aws_lambda_function.api.handler == "bootstrap" &&
      aws_lambda_function.api.memory_size == 256 &&
      aws_lambda_function.api.timeout == 10 &&
      aws_lambda_function.api.source_code_hash == filebase64sha256("../../api/.build/api.zip") &&
      aws_lambda_function.api.s3_object_version == aws_s3_object.api_package.version_id
    )
    error_message = "Keep the Go Lambda runtime and deploy the exact uploaded package version."
  }
  assert {
    condition = (
      aws_apigatewayv2_route.default.target == "integrations/${aws_apigatewayv2_integration.api.id}" &&
      aws_apigatewayv2_integration.api.integration_uri == aws_lambda_function.api.invoke_arn &&
      aws_apigatewayv2_integration.api.payload_format_version == "2.0" &&
      aws_apigatewayv2_stage.default.default_route_settings[0].throttling_burst_limit == 20 &&
      aws_apigatewayv2_stage.default.default_route_settings[0].throttling_rate_limit == 10 &&
      aws_lambda_permission.api_gateway.source_arn == "${aws_apigatewayv2_api.api.execution_arn}/*"
    )
    error_message = "Preserve API Gateway routing, throttling, and scoped Lambda invocation."
  }
  assert {
    condition = (
      jsondecode(aws_iam_role_policy.logs.policy).Statement[0].Resource == "${aws_cloudwatch_log_group.lambda.arn}:*" &&
      aws_cloudwatch_log_group.lambda.retention_in_days == 14 &&
      aws_cloudwatch_log_group.api_gateway.retention_in_days == 14 &&
      aws_s3_bucket_versioning.artifacts.versioning_configuration[0].status == "Enabled"
    )
    error_message = "Keep log permissions scoped and preserve retention and package versioning."
  }
}

run "reject_invalid_memory" {
  command = plan
  variables { lambda_memory_size = 127 }
  expect_failures = [var.lambda_memory_size]
}
