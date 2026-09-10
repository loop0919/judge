#!/usr/bin/env bash
# Run as root from a verified release directory, with dispatch disabled.
set -euo pipefail
cd "$(dirname "$0")"
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
test -f /sys/fs/cgroup/cgroup.controllers
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
systemctl stop judge-worker.service 2>/dev/null || true
swapoff -a
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  build-essential pkg-config libcap-dev libseccomp-dev libsystemd-dev python3 python3-boto3
# UID/GID belongs exclusively to the sandbox, never to an operator/service.
if getent passwd 60000 >/dev/null || getent group 60000 >/dev/null; then
  echo 'UID/GID 60000 must remain unassigned' >&2
  exit 1
fi
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
tar -xzf isolate.tar.gz -C "$build_dir" --strip-components=1
make -C "$build_dir" -j1 isolate
install -m 0755 "$build_dir/isolate" /usr/local/bin/isolate
install -d -m 700 /opt/judge /opt/judge/assets /root/.aws
install -d -m 755 /opt/judge/sandbox-etc /var/local/lib/isolate
# Only a minimal synthetic /etc is visible to submissions.
printf 'root:x:0:0:root:/:/usr/sbin/nologin\nisolate:x:60000:60000::/box:/usr/sbin/nologin\n' > /opt/judge/sandbox-etc/passwd
printf 'root:x:0:\nisolate:x:60000:\n' > /opt/judge/sandbox-etc/group
chmod 644 /opt/judge/sandbox-etc/*
install -m 0644 host.py sandbox.py worker.py smoke.py fingerprint.py /opt/judge/
install -m 0755 smoke.sh /opt/judge/
install -m 0644 isolate-commit /opt/judge/assets/
install -d /usr/local/etc
cat > /usr/local/etc/isolate <<'CONFIG'
box_root = /var/local/lib/isolate
lock_root = /run/isolate/locks
cg_root = auto:/run/judge/cgroup
first_uid = 60000
first_gid = 60000
num_boxes = 1
restricted_init = 1
CONFIG
/usr/local/bin/isolate --check-config
# Global flock prevents smoke and queue services from using the same box ID.
printf 'f /run/judge-slot.lock 0600 root root -\n' > /etc/tmpfiles.d/judge.conf
systemd-tmpfiles --create /etc/tmpfiles.d/judge.conf
install -m 0644 judge-worker.service /etc/systemd/system/judge-worker.service
systemctl daemon-reload
/usr/bin/python3 /opt/judge/fingerprint.py
printf 'Installed. Configure credentials/environment, run smoke, then enable the worker.\n'
