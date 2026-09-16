#!/usr/bin/env bash
# Run as root while worker/dispatch are stopped; fingerprint + smoke afterwards.
# Arguments: verified local agent .deb, SHA256, rendered Terraform agent JSON.
set -euo pipefail
test "$(id -u)" = 0
if systemctl is-active --quiet judge-worker; then
  echo 'Stop and drain the worker before installing monitoring' >&2
  exit 1
fi
[[ "$2" =~ ^[a-f0-9]{64}$ ]]
printf '%s  %s\n' "$2" "$1" | sha256sum -c -
dpkg -i "$1"
install -d -m 700 /var/log/judge
install -m 600 "$3" /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
cat > /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml <<'CONFIG'
[credentials]
shared_credential_profile = "default"
shared_credential_file = "/root/.aws/credentials"
CONFIG
chmod 600 /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml
# Explicit on-premise mode: Lightsail has no EC2 instance profile.
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m onPremise -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
systemctl enable amazon-cloudwatch-agent
