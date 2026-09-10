# No peering to the application VPC and no database credentials on the worker.
resource "aws_lightsail_key_pair" "worker" {
  name       = "${local.name}-judge"
  public_key = var.ssh_public_key
}
resource "aws_lightsail_instance" "worker" {
  name              = "${local.name}-judge-worker"
  availability_zone = var.availability_zone
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "small_ipv6_3_0"
  ip_address_type   = "ipv6"
  key_pair_name     = aws_lightsail_key_pair.worker.name
  # Bootstrap contains no credentials. The release is uploaded over SSH.
  user_data = "bash -c 'echo ${base64encode(templatefile("${path.module}/user-data.sh.tftpl", { admin_ipv6_cidr = var.admin_ipv6_cidr }))} | base64 -d | bash'"
}
resource "aws_lightsail_instance_public_ports" "worker" {
  instance_name = aws_lightsail_instance.worker.name
  port_info {
    protocol   = "tcp"
    from_port  = 22
    to_port    = 22
    cidrs      = []
    ipv6_cidrs = [var.admin_ipv6_cidr]
  }
  port_info {
    protocol   = "icmpv6"
    from_port  = -1
    to_port    = -1
    cidrs      = []
    ipv6_cidrs = ["::/0"]
  }
}
# Lightsail has no EC2 instance profile. Create/rotate the restricted access key
# outside Terraform; install it into /root/.aws/credentials with mode 0600.
resource "aws_iam_user" "worker" {
  name = "${local.name}-judge-worker"
}
resource "aws_iam_user_policy" "worker" {
  user = aws_iam_user.worker.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility"], Resource = aws_sqs_queue.queue["requests"].arn },
      { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.queue["results"].arn },
      { Effect = "Allow", Action = ["s3:GetObjectVersion"], Resource = "${aws_s3_bucket.jobs.arn}/jobs/*" }
    ]
  })
}
