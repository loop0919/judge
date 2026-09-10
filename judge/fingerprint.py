#!/usr/bin/python3
"""Enroll the installed runtime while dispatch and the worker are stopped."""
import hashlib
import json
from pathlib import Path
from host import ASSETS, platform_fingerprint

files = [str(Path('/opt/judge') / name) for name in
         ('host.py', 'sandbox.py', 'worker.py', 'sandbox-etc/passwd', 'sandbox-etc/group')]
files += ['/usr/local/bin/isolate', '/usr/local/etc/isolate', '/etc/systemd/system/judge-worker.service',
          '/opt/judge/assets/isolate-commit']
manifest = dict(platform=platform_fingerprint(), files={
    name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files
})
raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
(ASSETS / 'manifest.json').write_bytes(raw)
print('sha256:' + hashlib.sha256(raw).hexdigest())
