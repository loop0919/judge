mock_provider "aws" {
  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:ap-northeast-1:123456789012:certificate/example"
      domain_validation_options = [
        {
          domain_name           = "www.share-oj.net"
          resource_record_name  = "_validation.www.share-oj.net."
          resource_record_type  = "CNAME"
          resource_record_value = "_www.acm-validations.aws."
        },
        {
          domain_name           = "api.share-oj.net"
          resource_record_name  = "_validation.api.share-oj.net."
          resource_record_type  = "CNAME"
          resource_record_value = "_api.acm-validations.aws."
        }
      ]
    }
  }
}
variables {
  frontend_api_id = "frontend"
  backend_api_id  = "backend"
}
run "https_domains" {
  command = apply
  assert {
    condition = alltrue([for host, api in local.apis : (
      aws_apigatewayv2_api_mapping.site[host].api_id == api &&
      aws_apigatewayv2_api_mapping.site[host].stage == "$default" &&
      aws_apigatewayv2_api_mapping.site[host].domain_name == aws_apigatewayv2_domain_name.site[host].id &&
      aws_apigatewayv2_domain_name.site[host].domain_name == "${host}.share-oj.net" &&
      aws_apigatewayv2_domain_name.site[host].domain_name_configuration[0].certificate_arn == aws_acm_certificate_validation.site.certificate_arn &&
      aws_apigatewayv2_domain_name.site[host].domain_name_configuration[0].security_policy == "TLS_1_2" &&
      aws_apigatewayv2_domain_name.site[host].domain_name_configuration[0].ip_address_type == "dualstack"
    )]) && aws_apigatewayv2_api_mapping.site["www"].api_id == var.frontend_api_id && aws_apigatewayv2_api_mapping.site["api"].api_id == var.backend_api_id
    error_message = "Each validated HTTPS domain must route to the correct existing API default stage."
  }
  assert {
    condition = alltrue([for key, record in aws_route53_record.site : (
      record.zone_id == aws_route53_zone.site.zone_id &&
      record.name == "${split("-", key)[0]}.share-oj.net" &&
      record.type == split("-", key)[1] &&
      record.alias[0].name == aws_apigatewayv2_domain_name.site[split("-", key)[0]].domain_name_configuration[0].target_domain_name &&
      record.alias[0].zone_id == aws_apigatewayv2_domain_name.site[split("-", key)[0]].domain_name_configuration[0].hosted_zone_id
    )]) && toset(keys(aws_route53_record.site)) == toset(["www-A", "www-AAAA", "api-A", "api-AAAA"])
    error_message = "Both domains need IPv4 and IPv6 aliases to their own custom domain endpoints."
  }
  assert {
    condition = (
      aws_acm_certificate.site.domain_name == "www.share-oj.net" &&
      contains(aws_acm_certificate.site.subject_alternative_names, "api.share-oj.net") &&
      aws_acm_certificate.site.validation_method == "DNS" &&
      alltrue([for record in aws_route53_record.validation : record.zone_id == aws_route53_zone.site.zone_id]) &&
      length(aws_route53_record.validation) == 2 &&
      output.site_url == "https://www.share-oj.net" && output.api_url == "https://api.share-oj.net"
    )
    error_message = "The certificate and renewal DNS records must cover both public hostnames."
  }
}
