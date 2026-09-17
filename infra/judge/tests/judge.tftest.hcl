mock_provider "aws" {
  mock_resource "aws_sns_topic" { defaults = { arn = "arn:aws:sns:ap-northeast-1:123456789012:judge-test" } }
  mock_resource "aws_s3_bucket" { defaults = { arn = "arn:aws:s3:::judge-test-jobs" } }
  mock_resource "aws_s3_object" { defaults = { arn = "arn:aws:s3:::judge-test-jobs/releases/test", version_id = "test-version" } }
  mock_resource "aws_sqs_queue" { defaults = { arn = "arn:aws:sqs:ap-northeast-1:123456789012:judge-test", url = "https://sqs.ap-northeast-1.amazonaws.com/123456789012/judge-test" } }
  mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::123456789012:role/judge-test" } }
  mock_resource "aws_lambda_function" { defaults = { arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:judge-test" } }
  mock_resource "aws_cloudwatch_log_group" { defaults = { arn = "arn:aws:logs:ap-northeast-1:123456789012:log-group:judge-test" } }
  mock_resource "aws_cloudwatch_event_rule" { defaults = { arn = "arn:aws:events:ap-northeast-1:123456789012:rule/judge-test" } }
}
variables {
  discord_webhook_secret_arn = ""
  alerts_enabled             = false
  enabled                    = false
  ssh_public_key             = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJbU10sbvSiPykk/v/mzxDSkNPF1hvszNuRt/RLGKd5L"
  admin_ipv6_cidr            = "2001:db8::1/128"
  runtime_digest             = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  bridge_package_path        = "tests/package.txt"
  notify_package_path        = "tests/package.txt"
  database = {
    host              = "db.example.rds.amazonaws.com"
    name              = "openoj"
    secret_arn        = "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:db-test"
    subnet_ids        = ["subnet-12345678", "subnet-87654321"]
    security_group_id = "sg-12345678"
  }
  test_data_bucket = {
    id  = "judge-test-data"
    arn = "arn:aws:s3:::judge-test-data"
  }
}
run "isolated_worker" {
  command = apply
  assert {
    condition     = strcontains(file("${path.module}/user-data.sh.tftpl"), "ip daddr 169.254.169.254 tcp dport 80 accept")
    error_message = "Host cloud-init must retain access to IMDS across reboot."
  }
  assert {
    condition     = aws_lightsail_instance.worker.bundle_id == "small_ipv6_3_0" && aws_lightsail_instance.worker.ip_address_type == "ipv6"
    error_message = "Worker must use the 2 GB IPv6-only bundle."
  }
  assert {
    condition = alltrue([for port in aws_lightsail_instance_public_ports.worker.port_info :
      port.protocol == "icmpv6" || (port.protocol == "tcp" && port.from_port == 22 && port.to_port == 22 && port.ipv6_cidrs == toset([var.admin_ipv6_cidr]))
    ])
    error_message = "Only operator IPv6 SSH and ICMPv6 may be exposed."
  }
  assert {
    condition     = !strcontains(aws_iam_user_policy.worker.policy, "secretsmanager") && !strcontains(aws_iam_user_policy.worker.policy, "s3:ListBucket")
    error_message = "Worker must not access database credentials or mutate job objects."
  }
  assert {
    condition = alltrue([for statement in jsondecode(aws_iam_user_policy.worker.policy).Statement :
      !contains(statement.Action, "s3:PutObject") || statement.Resource == "arn:aws:s3:::judge-test-data/test-files/*/*/generated/*"
    ])
    error_message = "Worker writes must be limited to generated test files, never job objects or manually uploaded tests."
  }
  assert {
    condition = (
      strcontains(aws_iam_user_policy.worker.policy, "s3:GetObjectVersion") &&
      strcontains(aws_iam_user_policy.worker.policy, "arn:aws:s3:::judge-test-data/test-files/*") &&
      strcontains(output.worker_environment, "JUDGE_TEST_DATA_BUCKET=judge-test-data")
    )
    error_message = "Worker must read immutable test-data versions and receive the test-data bucket name."
  }
  assert {
    condition     = aws_cloudwatch_event_rule.dispatch.state == "DISABLED" && !aws_lambda_event_source_mapping.results.enabled
    error_message = "Queue integration must be opt-in after migration and smoke tests."
  }
  assert {
    condition = (
      aws_sqs_queue.queue["requests"].visibility_timeout_seconds > 1800 &&
      aws_sqs_queue.queue["results"].visibility_timeout_seconds >= 6 * aws_lambda_function.bridge.timeout &&
      aws_lambda_function.bridge.reserved_concurrent_executions == 5
    )
    error_message = "Queue leases must cover deadlines and bridge concurrency must protect the database."
  }
}
run "enable_dispatch" {
  command = plan
  variables { enabled = true }
  assert {
    condition     = aws_cloudwatch_event_rule.dispatch.state == "ENABLED" && aws_lambda_event_source_mapping.results.enabled
    error_message = "Enabling the integration must activate dispatch and result consumption together."
  }
}

run "reject_unpinned_enabled_runtime" {
  command = plan
  variables {
    enabled        = true
    runtime_digest = ""
  }
  expect_failures = [aws_lambda_function.bridge]
}
run "reject_public_ssh" {
  command = plan
  variables { admin_ipv6_cidr = "::/0" }
  expect_failures = [var.admin_ipv6_cidr]
}
run "ssm_only" {
  command = plan
  variables { ssh_enabled = false }
  assert {
    condition     = alltrue([for port in aws_lightsail_instance_public_ports.worker.port_info : port.protocol == "icmpv6"])
    error_message = "SSM-only mode must expose no TCP ports."
  }
}

run "observability" {
  command = plan
  variables {
    alerts_enabled             = true
    discord_webhook_secret_arn = "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:discord-test"
    discord_webhook_secret_key = "ALART_DISCORD_WEBHOOK"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.judge["worker"].treat_missing_data == "breaching" && aws_cloudwatch_metric_alarm.judge["worker"].evaluation_periods == 3 && aws_cloudwatch_metric_alarm.judge["dispatch-missing"].treat_missing_data == "breaching"
    error_message = "Both worker and scheduled DB observation must detect missing telemetry."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.judge["judge-code"].metric_name != aws_cloudwatch_metric_alarm.judge["platform"].metric_name && aws_cloudwatch_metric_alarm.judge["judge-code"].treat_missing_data == "notBreaching"
    error_message = "Author errors must be separate from infrastructure errors; inactivity is healthy."
  }
  assert {
    condition     = aws_cloudwatch_log_group.worker.retention_in_days == 14 && length(aws_cloudwatch_metric_alarm.dead["requests"].alarm_actions) == 1 && length(aws_cloudwatch_metric_alarm.dead["results"].ok_actions) == 1
    error_message = "Bound retention and connect existing DLQ alarm/recovery actions."
  }
  assert {
    condition     = jsondecode(aws_iam_user_policy.worker_observability.policy).Statement[1].Condition.StringEquals["cloudwatch:namespace"] == "Judge/judge-dev" && !strcontains(aws_iam_user_policy.worker_observability.policy, "secretsmanager")
    error_message = "Worker metrics must be namespace restricted and cannot read notification secrets."
  }
  assert {
    condition     = aws_lambda_function.notify.environment[0].variables.WEBHOOK_SECRET_KEY == "ALART_DISCORD_WEBHOOK" && length(aws_lambda_function.notify.vpc_config) == 0
    error_message = "Notifier reads the selected secret key and requires no NAT or judge host network."
  }
}
run "reject_alerts_without_secret" {
  command = plan
  variables { alerts_enabled = true }
  expect_failures = [aws_lambda_function.notify]
}
