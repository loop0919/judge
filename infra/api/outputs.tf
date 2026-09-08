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

output "login_url" {
  value = "${aws_apigatewayv2_api.api.api_endpoint}/auth/login"
}
