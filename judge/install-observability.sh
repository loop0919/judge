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
install -d -m 700 /var/log/judge /etc/judge
install -m 600 "$3" /etc/judge/cloudwatch-agent.json
cat > /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml <<'CONFIG'
[credentials]
shared_credential_profile = "default"
shared_credential_file = "/root/.aws/credentials"
CONFIG
chmod 600 /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml
# The config downloader needs a region before it reads the agent JSON.
AWS_REGION=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["agent"]["region"])' "$3")
export AWS_REGION
export AWS_DEFAULT_REGION="$AWS_REGION"
# Explicit on-premise mode: Lightsail has no EC2 instance profile.
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -d -a fetch-config -m onPremise -s \
  -c file:/etc/judge/cloudwatch-agent.json
systemctl enable amazon-cloudwatch-agent
