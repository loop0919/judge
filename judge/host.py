#!/usr/bin/python3
"""Single-slot isolate runner. All paths and executables are operator-owned."""
import base64
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

import sandbox

ASSETS = Path('/opt/judge/assets')


def pointer(body):
    if len(body) > 4096:
        raise ValueError('pointer too large')
    item = json.loads(body)
    for name in ('submissionId', 'attemptId'):
        if str(uuid.UUID(item[name])) != item[name]:
            raise ValueError('invalid identity')
    expected = f"jobs/{item['submissionId']}/{item['attemptId']}.json"
    if item['key'] != expected or not re.fullmatch('[a-f0-9]{64}', item['sha256']):
        raise ValueError('invalid object pointer')
    if not isinstance(item['versionId'], str) or not 0 < len(item['versionId']) <= 1024:
        raise ValueError('invalid version')
    return item


def validate_job(job, runtime):
    if job.get('runtimeDigest') != runtime or job.get('runtime') != 'cpp17-isolate':
        raise ValueError('runtime mismatch')
    source = job.get('source')
    if not isinstance(source, str) or not 0 < len(source.encode()) <= 65536 or '\0' in source:
        raise ValueError('source')
    if job.get('memoryLimitMb') != 512:
        raise ValueError('memory limit')
    ms = job.get('timeLimitMs')
    if type(ms) is not int or not 100 <= ms <= 5000 or ms % 100:
        raise ValueError('time limit')
    cases = job.get('cases')
    if not isinstance(cases, list) or not 1 <= len(cases) <= 100:
        raise ValueError('cases')
    size = 0
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get('name', ''), str) or len(case.get('name', '')) > 64:
            raise ValueError('case')
        for key in ('input', 'output'):
            value = case.get(key)
            if not isinstance(value, str) or len(value.encode()) > 65536 or '\0' in value:
                raise ValueError('test data')
            size += len(value.encode())
    if size > 256 * 1024:
        raise ValueError('test set limit')


def number(value, maximum):
    if type(value) not in (float, int) or not math.isfinite(value) or not 0 <= value <= maximum:
        raise ValueError('invalid measurement')
    return value


def case_result(reply, index, case):
    if reply.get('index') != index or reply.get('status') not in ('', 'RE', 'SG', 'TO'):
        raise ValueError('invalid case response')
    for key in ('oom', 'overflow'):
        if type(reply.get(key)) is not bool:
            raise ValueError('invalid flag')
    for key in ('exitCode', 'signal'):
        if type(reply.get(key)) is not int or not 0 <= reply[key] <= 255:
            raise ValueError('invalid exit status')
    cpu = number(reply.get('cpuTimeMs'), 120000)
    wall = number(reply.get('wallTimeMs'), 120000)
    memory = number(reply.get('memoryBytes'), 4 * 1024**3)
    output = base64.b64decode(reply['output'], validate=True)
    if len(output) > 1024 * 1024:
        raise ValueError('output limit')
    if reply['overflow']:
        verdict = 'OLE'
    elif reply['oom']:
        verdict = 'MLE'
    elif reply['status'] == 'TO':
        verdict = 'TLE'
    elif reply['status'] or reply['exitCode'] or reply['signal']:
        verdict = 'RE'
    elif re.findall(rb'[^ \t\n\r\v\f]+', output) != re.findall(rb'[^ \t\n\r\v\f]+', case['output'].encode()):
        verdict = 'WA'
    else:
        verdict = 'AC'
    return dict(name=case.get('name') or f'ケース{index + 1}', verdict=verdict,
                cpuTimeMs=cpu, wallTimeMs=wall, memoryBytes=memory)


def prepare_cgroup():
    # The systemd unit delegates this subtree and caps its aggregate memory/pids.
    relative = next(line[3:] for line in Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
    root = Path('/sys/fs/cgroup') / relative.lstrip('/')
    if root.name == 'controller':
        root = root.parent
    leaf = root / 'controller'
    leaf.mkdir(exist_ok=True)
    (leaf / 'cgroup.procs').write_text(str(os.getpid()))
    (root / 'cgroup.subtree_control').write_text('+cpu +memory +pids')
    # Kill the whole service only if its aggregate limit is exceeded.
    (root / 'memory.oom.group').write_text('1')
    Path('/run/judge/cgroup').write_text(str(root))
    for child in root.iterdir():
        if child.is_dir() and child.name != 'controller':
            (child / 'cgroup.kill').write_text('1')
            child.rmdir()
    return root


@contextlib.contextmanager
def slot():
    # One slot across worker and manual smoke tests, including separate services.
    import fcntl
    with open('/run/judge-slot.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def judge(job, runtime):
    validate_job(job, runtime)
    deadline = time.monotonic() + 1800
    result = dict(verdict='AC', passed=0, total=len(job['cases']), cases=[])
    try:
        compiled = sandbox.execute(dict(source=job['source']), True)
        if not compiled['compiled']:
            return dict(verdict='CE', passed=0, total=len(job['cases']), compileLog=compiled['compileLog'])
        for index, case in enumerate(job['cases']):
            if time.monotonic() >= deadline:
                raise TimeoutError('job deadline')
            reply = sandbox.execute(dict(input=base64.b64encode(case['input'].encode()).decode(),
                                         timeLimitMs=job['timeLimitMs'], memoryLimitMb=job['memoryLimitMb']))
            reply['index'] = index
            item = case_result(reply, index, case)
            result['cases'].append(item)
            if item['verdict'] == 'AC':
                result['passed'] += 1
            elif result['verdict'] == 'AC':
                result['verdict'] = item['verdict']
    finally:
        sandbox.ARTIFACT.unlink(missing_ok=True)
        sandbox.META.unlink(missing_ok=True)
    return result


def platform_fingerprint():
    # Detect compiler/library or kernel updates before consuming another job.
    packages = subprocess.check_output(['dpkg-query', '-W', '-f=${Package}=${Version}\n'], env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
    return dict(kernel=os.uname().release, packages=hashlib.sha256(packages).hexdigest())


def verify_assets():
    manifest_data = (ASSETS / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_data)
    if manifest['platform'] != platform_fingerprint():
        raise ValueError('system changed; fingerprint and smoke-test before enabling worker')
    for name, digest in manifest['files'].items():
        with open(name, 'rb') as file:
            if hashlib.file_digest(file, 'sha256').hexdigest() != digest:
                raise ValueError('runtime checksum mismatch')
    return 'sha256:' + hashlib.sha256(manifest_data).hexdigest()
