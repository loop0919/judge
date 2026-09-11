mock_provider "aws" {
  mock_resource "aws_vpc" {
    defaults = { ipv6_cidr_block = "2001:db8:1234:5600::/56" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-northeast-1a", "ap-northeast-1c"] }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      address            = "postgres.example.rds.amazonaws.com"
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!db-test", secret_status = "active", kms_key_id = "test-key" }]
    }
  }
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

variables { existing_google_domain = "" }

run "api_contract" {
  command = apply
  variables {
    google_client_id     = ""
    google_client_secret = ""
  }
  assert {
    condition     = !aws_cognito_user_pool_client.api.allowed_oauth_flows_user_pool_client && aws_cognito_user_pool_client.api.default_redirect_uri == "https://disabled.invalid/auth/google/callback" && contains(aws_cognito_user_pool_client.api.callback_urls, aws_cognito_user_pool_client.api.default_redirect_uri)
    error_message = "Email-only configuration must disable OAuth and replace imported redirects with a consistent inert URL."
  }

  assert {
    condition = (
      aws_lambda_function.api.environment[0].variables["COGNITO_CLIENT_ID"] == aws_cognito_user_pool_client.api.id &&
      aws_lambda_function.api.environment[0].variables["COGNITO_CLIENT_SECRET"] == aws_cognito_user_pool_client.api.client_secret &&
      aws_lambda_function.api.environment[0].variables["COGNITO_USER_POOL_ID"] == aws_cognito_user_pool.users.id &&
      aws_cognito_user_pool_client.api.user_pool_id == aws_cognito_user_pool.users.id &&
      aws_cognito_user_pool_client.api.generate_secret &&
      aws_cognito_user_pool_client.api.explicit_auth_flows == toset(["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]) &&
      aws_cognito_user_pool_client.api.prevent_user_existence_errors == "ENABLED" &&
      aws_cognito_user_pool_client.api.access_token_validity == 60 &&
      aws_cognito_user_pool_client.api.token_validity_units[0].access_token == "minutes"
    )
    error_message = "Connect the password login API to its private Cognito client and prevent user enumeration."
  }
  assert {
    condition = (
      aws_cognito_user_pool.users.username_attributes == toset(["email"]) &&
      !aws_cognito_user_pool.users.username_configuration[0].case_sensitive &&
      !aws_cognito_user_pool.users.admin_create_user_config[0].allow_admin_create_user_only &&
      aws_cognito_user_pool.users.auto_verified_attributes == toset(["email"]) &&
      aws_cognito_user_pool.users.verification_message_template[0].default_email_option == "CONFIRM_WITH_CODE" &&
      aws_cognito_user_pool.users.deletion_protection == "ACTIVE" &&
      aws_cognito_user_pool.users.mfa_configuration == "OFF" &&
      aws_cognito_user_pool.users.user_pool_tier == "LITE"
    )
    error_message = "Allow self-registration with email verification and protect the user directory."
  }
  assert {
    condition = (
      aws_lambda_function.api.runtime == "provided.al2023" &&
      aws_lambda_function.api.architectures == tolist(["arm64"]) &&
      aws_lambda_function.api.handler == "bootstrap" &&
      aws_lambda_function.api.memory_size == 256 &&
      aws_lambda_function.api.timeout == 30 &&
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
      aws_apigatewayv2_integration.api.timeout_milliseconds == 20000 &&
      aws_apigatewayv2_stage.default.default_route_settings[0].throttling_burst_limit == 20 &&
      aws_apigatewayv2_stage.default.default_route_settings[0].throttling_rate_limit == 10 &&
      aws_lambda_permission.api_gateway.source_arn == "${aws_apigatewayv2_api.api.execution_arn}/*"
    )
    error_message = "Preserve API Gateway routing, throttling, and scoped Lambda invocation."
  }
  assert {
    condition = (
      contains(jsondecode(aws_iam_role_policy.logs.policy).Statement[0].Resource, "${aws_cloudwatch_log_group.lambda.arn}:*") &&
      contains(jsondecode(aws_iam_role_policy.logs.policy).Statement[0].Resource, "${aws_cloudwatch_log_group.migration.arn}:*") &&
      aws_cloudwatch_log_group.lambda.retention_in_days == 14 &&
      aws_cloudwatch_log_group.api_gateway.retention_in_days == 14 &&
      aws_s3_bucket_versioning.artifacts.versioning_configuration[0].status == "Enabled"
    )
    error_message = "Keep log permissions scoped and preserve retention and package versioning."
  }
  assert {
    condition = (
      aws_s3_bucket_versioning.test_data.versioning_configuration[0].status == "Enabled" &&
      aws_s3_bucket_public_access_block.test_data.block_public_policy &&
      one(one(aws_s3_bucket_server_side_encryption_configuration.test_data.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256" &&
      strcontains(jsonencode(aws_s3_bucket_lifecycle_configuration.test_data.rule), "\"noncurrent_days\":1") &&
      aws_lambda_function.api.environment[0].variables["TEST_DATA_BUCKET"] == aws_s3_bucket.test_data.id &&
      strcontains(aws_iam_role_policy.test_data.policy, "s3:GetObjectVersion") &&
      strcontains(aws_iam_role_policy.test_data.policy, "s3:PutObjectVersionTagging")
    )
    error_message = "Keep private versioned test data encrypted and grant only object-level API access."
  }
}

run "database_contract" {
  command = apply
  assert {
    condition = (
      !aws_db_instance.application.publicly_accessible &&
      aws_db_instance.application.storage_encrypted &&
      aws_db_instance.application.manage_master_user_password &&
      aws_db_instance.application.backup_retention_period == 7 &&
      aws_db_instance.application.deletion_protection &&
      !aws_db_instance.application.skip_final_snapshot &&
      aws_vpc_security_group_ingress_rule.postgres.referenced_security_group_id == aws_security_group.application.id &&
      aws_vpc_security_group_ingress_rule.postgres.from_port == 5432 &&
      aws_lambda_function.api.environment[0].variables["DATABASE_SECRET_ARN"] == aws_db_instance.application.master_user_secret[0].secret_arn &&
      !contains(keys(aws_lambda_function.api.environment[0].variables), "DATABASE_URL") &&
      aws_lambda_function.api.vpc_config[0].subnet_ids == toset(aws_subnet.private[*].id) &&
      aws_lambda_function.api.vpc_config[0].ipv6_allowed_for_dual_stack &&
      aws_lambda_function.migration.vpc_config[0].ipv6_allowed_for_dual_stack &&
      aws_vpc_security_group_egress_rule.https.cidr_ipv6 == "::/0" &&
      alltrue([for route in aws_route_table.private.route : route.ipv6_cidr_block == "::/0" && route.egress_only_gateway_id == aws_egress_only_internet_gateway.application.id]) &&
      aws_lambda_function.api.reserved_concurrent_executions == -1 &&
      aws_lambda_function.migration.reserved_concurrent_executions == -1 &&
      aws_lambda_function.migration.environment[0].variables == tomap(local.database_environment)
    )
    error_message = "Keep the DB private, encrypted and backed up; pass only a managed secret reference and run migrations inside the VPC."
  }
}

run "production_concurrency" {
  command = plan
  variables { environment = "prod" }
  assert {
    condition = (
      aws_lambda_function.api.reserved_concurrent_executions == 10 &&
      aws_lambda_function.migration.reserved_concurrent_executions == 1
    )
    error_message = "Outside dev, preserve API and migration concurrency limits to protect the database."
  }
}

run "google_contract" {
  command = apply
  variables {
    google_client_id     = "test.apps.googleusercontent.com"
    google_client_secret = "test-only-secret"
    public_site_url      = "https://judge.example"
  }
  assert {
    condition = (
      aws_cognito_user_pool_client.api.default_redirect_uri == "https://judge.example/auth/google/callback" &&
      aws_cognito_user_pool_client.api.allowed_oauth_flows_user_pool_client &&
      aws_cognito_user_pool_client.api.allowed_oauth_flows == toset(["code"]) &&
      aws_cognito_user_pool_client.api.callback_urls == toset(["https://judge.example/auth/google/callback"]) &&
      contains(aws_cognito_user_pool_client.api.supported_identity_providers, "Google") &&
      aws_cognito_identity_provider.google[0].user_pool_id == aws_cognito_user_pool.users.id
    )
    error_message = "Google must use authorization code flow and the deployed callback without removing email login."
  }
}

run "existing_google_domain" {
  command = plan
  variables {
    google_client_id       = "test.apps.googleusercontent.com"
    google_client_secret   = "test-only-secret"
    public_site_url        = "https://judge.example"
    existing_google_domain = "judge-dev-loop0919"
  }
  assert {
    condition = (
      aws_cognito_user_pool_domain.users[0].domain == "judge-dev-loop0919" &&
      output.cognito_domain == "https://judge-dev-loop0919.auth.ap-northeast-1.amazoncognito.com"
    )
    error_message = "Keep the existing domain and frontend OAuth endpoint when adopting Google login."
  }
}

run "reject_partial_google_configuration" {
  command = plan
  variables {
    google_client_id     = "test.apps.googleusercontent.com"
    google_client_secret = ""
    public_site_url      = ""
  }
  expect_failures = [var.google_client_secret, var.public_site_url]
}

run "reject_invalid_memory" {
  command = plan
  variables { lambda_memory_size = 127 }
  expect_failures = [var.lambda_memory_size]
}
