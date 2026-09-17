resource "aws_s3_object" "migration_package" {
  bucket      = aws_s3_bucket.artifacts.id
  key         = "${local.name}/api/migrate.zip"
  source      = "${path.module}/../../api/.build/migrate.zip"
  source_hash = filebase64sha256("${path.module}/../../api/.build/migrate.zip")
  depends_on = [
    aws_s3_bucket_versioning.artifacts,
    aws_s3_bucket_server_side_encryption_configuration.artifacts,
    aws_s3_bucket_policy.artifacts,
    aws_s3_bucket_public_access_block.artifacts,
    aws_s3_bucket_ownership_controls.artifacts,
  ]
}
resource "aws_cloudwatch_log_group" "migration" {
  name              = "/aws/lambda/${local.name}-api-migrate"
  retention_in_days = 14
}
# No API Gateway route: only the deployment role can invoke this function.
resource "aws_lambda_function" "migration" {
  function_name                  = "${local.name}-api-migrate"
  description                    = "Apply versioned PostgreSQL migrations"
  architectures                  = ["arm64"]
  handler                        = "bootstrap"
  runtime                        = "provided.al2023"
  memory_size                    = 256
  timeout                        = 120
  role                           = aws_iam_role.api.arn
  s3_bucket                      = aws_s3_object.migration_package.bucket
  s3_key                         = aws_s3_object.migration_package.key
  s3_object_version              = aws_s3_object.migration_package.version_id
  source_code_hash               = filebase64sha256("${path.module}/../../api/.build/migrate.zip")
  reserved_concurrent_executions = 1
  environment { variables = local.database_environment }
  vpc_config {
    ipv6_allowed_for_dual_stack = true
    subnet_ids                  = aws_subnet.private[*].id
    security_group_ids          = [aws_security_group.application.id]
  }
  depends_on = [aws_iam_role_policy.logs, aws_iam_role_policy.database, aws_iam_role_policy.vpc, aws_cloudwatch_log_group.migration, aws_route_table_association.private]
}
output "migration_lambda_function_name" { value = aws_lambda_function.migration.function_name }
