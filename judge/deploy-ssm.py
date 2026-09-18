#!/usr/bin/env python3
"""Upload a pinned worker release and install it via SSM Run Command."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import time


def aws(*args):
    return json.loads(subprocess.check_output(['aws', *args, '--output', 'json']) or '{}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instance', required=True)
    parser.add_argument('--bucket', required=True)
    parser.add_argument('--region', default='ap-northeast-1')
    parser.add_argument('--release', type=Path, default=Path('judge/.build/worker.tar.gz'))
    args = parser.parse_args()
    if not re.fullmatch('mi-[a-f0-9]+', args.instance):
        parser.error('expected a Lightsail SSM managed-node ID')
    with args.release.open('rb') as file:
        digest = hashlib.file_digest(file, 'sha256').hexdigest()
    uri = 's3://' + args.bucket + '/releases/' + digest + '/worker.tar.gz'
    subprocess.run(['aws', 's3', 'cp', str(args.release), uri, '--region', args.region, '--only-show-errors'], check=True)
    url = subprocess.check_output(['aws', 's3', 'presign', uri, '--region', args.region,
        '--endpoint-url', 'https://s3.dualstack.' + args.region + '.amazonaws.com', '--expires-in', '3600'], text=True).strip()
    command = '\n'.join([
        'set -eu', 'umask 077', 'systemctl stop judge-worker.service || true',
        'install -d -m 700 /opt/judge-release',
        'curl --fail --location --proto "=https" ' + shlex.quote(url) + ' -o /opt/judge-release/worker.tar.gz',
        "printf '%s\\n' '" + digest + "  /opt/judge-release/worker.tar.gz' | sha256sum -c -",
        'tar -xzf /opt/judge-release/worker.tar.gz -C /opt/judge-release',
        # The verified release remains in S3; free its duplicate before staging the runtime tree.
        'rm /opt/judge-release/worker.tar.gz',
        'bash /opt/judge-release/install.sh',
    ])
    sent = aws('ssm', 'send-command', '--region', args.region, '--instance-ids', args.instance,
        '--document-name', 'AWS-RunShellScript', '--parameters', json.dumps({'commands': [command], 'executionTimeout': ['7200']}),
        '--comment', 'Install verified ADR 0007 worker; judging remains stopped')
    command_id = sent['Command']['CommandId']
    print('SSM install command:', command_id, flush=True)
    # Keep a bounded polling loop; no success is inferred from a timeout.
    for _ in range(720):
        time.sleep(10)
        result = aws('ssm', 'list-command-invocations', '--region', args.region, '--command-id', command_id, '--details')
        if not result['CommandInvocations']:
            continue
        status = result['CommandInvocations'][0]['Status']
        if status in ('Pending', 'InProgress', 'Delayed'):
            continue
        print('SSM install:', status)
        if status != 'Success':
            raise SystemExit('Install failed; inspect command ' + command_id)
        break
    else:
        raise SystemExit('Install did not finish before deadline')
