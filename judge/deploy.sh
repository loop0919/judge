#!/usr/bin/env bash
# Upload the reviewed release and non-secret Terraform environment over SSH.
# SSH authenticates with the operator's existing key/agent and verifies host keys.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${JUDGE_IPV6:?Set the worker IPv6 address}"
[[ "$JUDGE_IPV6" =~ ^[0-9a-fA-F:]+$ ]]
worker_target="ubuntu@$JUDGE_IPV6"
ssh_args=(-6 -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
release_sha=$(sha256sum judge/.build/worker.tar.gz | cut -d ' ' -f 1)
printf '[1/3] Connecting to %s and uploading worker package...\n' "$worker_target"
ssh "${ssh_args[@]}" "$worker_target" 'umask 077; cat > /home/ubuntu/judge-worker.tar.gz' < judge/.build/worker.tar.gz
printf '[2/3] Verifying package and installing runtime on Lightsail...\n'
ssh "${ssh_args[@]}" "$worker_target" "echo '$release_sha  /home/ubuntu/judge-worker.tar.gz' | sha256sum -c - && sudo install -d -m 700 /opt/judge-release && sudo tar -xzf /home/ubuntu/judge-worker.tar.gz -C /opt/judge-release && sudo bash /opt/judge-release/install.sh"
printf '[3/3] Reading Terraform outputs and configuring worker environment...\n'
terraform -chdir=infra/judge output -raw worker_environment | ssh "${ssh_args[@]}" "$worker_target" 'sudo tee /opt/judge/worker.env >/dev/null; sudo chmod 600 /opt/judge/worker.env'
printf 'Credentials and smoke tests are required before enabling the worker.\n'
