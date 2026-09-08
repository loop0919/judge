output "site_url" {
  description = "OpenOJ public HTTPS URL."
  value       = aws_apigatewayv2_api.web.api_endpoint
}
output "frontend_lambda_function_name" {
  value = aws_lambda_function.web.function_name
}
