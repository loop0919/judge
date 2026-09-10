#!/usr/bin/env bash
# Same systemd limits/mount namespace as production, without consuming SQS.
set -euo pipefail
if systemctl is-active --quiet judge-worker; then
  echo 'Stop/drain judge-worker before smoke tests' >&2
  exit 1
fi
sed -e 's|ExecStart=.*|ExecStart=/usr/bin/python3 /opt/judge/smoke.py|' \
    -e 's|Type=simple|Type=oneshot|' -e 's|Restart=on-failure|Restart=no|' \
    -e 's|EnvironmentFile=|EnvironmentFile=-|' \
    /etc/systemd/system/judge-worker.service > /run/systemd/system/judge-smoke.service
systemctl daemon-reload
smoke_started=$(date --iso-8601=seconds)
trap 'journalctl -u judge-smoke --no-pager --since "$smoke_started"' EXIT
systemctl start judge-smoke
