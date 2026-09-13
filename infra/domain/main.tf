# Import the registrar-created zone before applying; preserve its name servers.
resource "aws_route53_zone" "site" {
  name          = var.domain_name
  comment       = "HostedZone created by Route53 Registrar"
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

locals {
  apis = { www = var.frontend_api_id, api = var.backend_api_id }
  validation = {
    for name in keys(local.apis) : name => one([
      for option in aws_acm_certificate.site.domain_validation_options : option
      if option.domain_name == "${name}.${var.domain_name}"
    ])
  }
}

resource "aws_acm_certificate" "site" {
  domain_name               = "www.${var.domain_name}"
  subject_alternative_names = ["api.${var.domain_name}"]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = local.validation
  zone_id  = aws_route53_zone.site.zone_id
  name     = each.value.resource_record_name
  type     = each.value.resource_record_type
  records  = [each.value.resource_record_value]
  ttl      = 300
}

resource "aws_acm_certificate_validation" "site" {
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}

resource "aws_apigatewayv2_domain_name" "site" {
  for_each    = local.apis
  domain_name = "${each.key}.${var.domain_name}"
  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.site.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
    ip_address_type = "dualstack"
  }
}

resource "aws_apigatewayv2_api_mapping" "site" {
  for_each    = local.apis
  api_id      = each.value
  domain_name = aws_apigatewayv2_domain_name.site[each.key].id
  stage       = "$default"
}

resource "aws_route53_record" "site" {
  for_each = { for pair in setproduct(keys(local.apis), ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => { host = pair[0], type = pair[1] } }
  zone_id  = aws_route53_zone.site.zone_id
  name     = "${each.value.host}.${var.domain_name}"
  type     = each.value.type
  alias {
    name                   = aws_apigatewayv2_domain_name.site[each.value.host].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.site[each.value.host].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
  depends_on = [aws_apigatewayv2_api_mapping.site]
}

output "site_url" {
  value = "https://www.${var.domain_name}"
}

output "api_url" {
  value = "https://api.${var.domain_name}"
}
