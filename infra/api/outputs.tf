output "api_endpoint" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "health_url" {
  value = "${aws_apigatewayv2_api.api.api_endpoint}/health"
}

output "api_lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "artifact_bucket_name" {
  value = aws_s3_bucket.artifacts.id
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.users.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.api.id
}

output "cognito_client_secret" {
  value     = aws_cognito_user_pool_client.api.client_secret
  sensitive = true
}

output "cognito_domain" {
  value = var.google_client_id != "" ? "https://${aws_cognito_user_pool_domain.users[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""
}

output "login_url" {
  value = "${aws_apigatewayv2_api.api.api_endpoint}/auth/login"
}

output "judge_bridge_database" {
  description = "Connection metadata for the judge bridge Lambda; no password is exposed."
  value = {
    host              = aws_db_instance.application.address
    name              = aws_db_instance.application.db_name
    secret_arn        = aws_db_instance.application.master_user_secret[0].secret_arn
    subnet_ids        = aws_subnet.private[*].id
    security_group_id = aws_security_group.application.id
  }
}
