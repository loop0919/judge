#!/usr/bin/python3
"""Trusted isolate controller on the dedicated Lightsail host."""
import base64
import math
import os
from pathlib import Path
import shutil
import stat
import subprocess


ISOLATE = '/usr/local/bin/isolate'
META = Path('/run/judge/meta')
ARTIFACT = Path('/run/judge/main')
OUTPUT_LIMIT = 16 * 1024 * 1024


def invoke(args, timeout=10):
    return subprocess.run([ISOLATE, '--cg', '--box-id=0', *args],
                          stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, timeout=timeout, check=False,
                          env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'})


def metadata(text):
    data = {}
    for line in text.splitlines():
        key, sep, value = line.partition(':')
        if not sep or key in data:
            raise ValueError('invalid isolate metadata')
        data[key] = value
    if data.get('status') == 'XX':
        raise RuntimeError('isolate failure')
    values = {}
    for src, dst, scale in [('time', 'cpuTimeMs', 1000), ('time-wall', 'wallTimeMs', 1000),
                            ('cg-mem', 'memoryBytes', 1024)]:
        value = float(data[src])
        if not math.isfinite(value) or value < 0:
            raise ValueError('invalid measurement')
        values[dst] = math.ceil(value * scale)
    values.update(status=data.get('status', ''), oom='cg-oom-killed' in data,
                  exitCode=int(data.get('exitcode', '0')), signal=int(data.get('exitsig', '0')))
    return values


def regular_read(path, limit):
    # Never follow links created by a submission, or open FIFOs/devices.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as file:
        if not stat.S_ISREG(os.fstat(file.fileno()).st_mode):
            raise ValueError('not a regular file')
        return file.read(limit + 1)


def execute(request, compile_phase=False):
    if compile_phase:
        source = request.get('source')
        if not isinstance(source, str) or not 0 < len(source.encode()) <= 65536 or '\0' in source:
            raise ValueError('invalid source')
        memory, cpu, wall = 1024, 30, 40
    else:
        memory = request.get('memoryLimitMb')
        ms = request.get('timeLimitMs')
        if memory != 512 or type(ms) is not int or not 100 <= ms <= 5000 or ms % 100:
            raise ValueError('invalid limits')
        cpu, wall = ms / 1000, 3 * ms / 1000 + 1
    init = invoke(['--init'])
    if init.returncode:
        raise RuntimeError('isolate init')
    # --init prints the box root; /box maps its box/ subdirectory.
    box = Path(init.stdout.decode().strip()) / 'box'
    try:
        META.unlink(missing_ok=True)
        if compile_phase:
            (box / 'main.cpp').write_text(source)
            command = ['/usr/bin/g++', '-std=c++17', '-O2', '-pipe', '/box/main.cpp', '-o', '/box/main']
        else:
            shutil.copyfile(ARTIFACT, box / 'main')
            (box / 'main').chmod(0o555)
            data = base64.b64decode(request.get('input', ''), validate=True)
            if len(data) > 16 * 1024 * 1024:
                raise ValueError('input limit')
            (box / 'input').write_bytes(data)
            command = ['/box/main']
        # Metadata and saved artifact are outside /box and never mapped into it.
        args = [f'--meta={META}', f'--time={cpu}', f'--wall-time={wall}',
                f'--cg-mem={memory * 1024}', '--processes=64', '--open-files=64',
                '--fsize=32768' if compile_phase else '--fsize=16384',
                '--stdout=stdout', '--stderr=stderr', '--env=PATH=/usr/bin:/bin',
                '--dir=/etc=/opt/judge/sandbox-etc', '--run']
        if not compile_phase:
            args.insert(-1, '--stdin=input')
        result = invoke([*args, '--', *command], timeout=wall + 10)
        if result.returncode not in (0, 1):
            raise RuntimeError('isolate execution')
        metrics = metadata(META.read_text())
        stdout = regular_read(box / 'stdout', OUTPUT_LIMIT)
        stderr = regular_read(box / 'stderr', 65536)
        overflow = len(stdout) > OUTPUT_LIMIT or len(stderr) > 65536 or metrics['signal'] == 25
        if compile_phase:
            success = not (result.returncode or overflow or metrics['oom'] or metrics['status'])
            if success:
                artifact = regular_read(box / 'main', 32 * 1024 * 1024)
                if not artifact or len(artifact) > 32 * 1024 * 1024:
                    success = False
                else:
                    ARTIFACT.write_bytes(artifact)
                    ARTIFACT.chmod(0o500)
            return {'compiled': success, 'compileLog': stderr[:65536].decode(errors='replace')}
        metrics.update(output=base64.b64encode(stdout[:OUTPUT_LIMIT]).decode(), overflow=overflow)
        return metrics
    finally:
        # isolate cleanup destroys the box and its cgroup, including descendants.
        if invoke(['--cleanup']).returncode:
            raise SystemExit('isolate cleanup failed; refusing another job')
