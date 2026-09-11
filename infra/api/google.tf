# Enable Google only when its OAuth client is configured. Email signup stays available.
resource "aws_cognito_identity_provider" "google" {
  count         = var.google_client_id != "" ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.users.id
  provider_name = "Google"
  provider_type = "Google"
  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }
  attribute_mapping = { email = "email" }
  # Cognito adds these provider-discovered values after creation.
  lifecycle {
    ignore_changes = [
      provider_details["attributes_url"],
      provider_details["attributes_url_add_attributes"],
      provider_details["authorize_url"],
      provider_details["oidc_issuer"],
      provider_details["token_request_method"],
      provider_details["token_url"],
    ]
  }
}

resource "aws_cognito_user_pool_domain" "users" {
  count        = var.google_client_id != "" ? 1 : 0
  domain       = var.existing_google_domain != "" ? var.existing_google_domain : lower(replace(aws_cognito_user_pool.users.id, "_", "-"))
  user_pool_id = aws_cognito_user_pool.users.id
}
