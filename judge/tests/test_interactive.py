import subprocess
import sys
import tempfile
from pathlib import Path
import time
import unittest
from unittest.mock import patch

from test_runner import host
import interactive


class InteractiveTests(unittest.TestCase):
    def run_pair(self, source, interactor, wall=3, statuses=None, capture=None):
        processes = [subprocess.Popen([sys.executable, '-c', code], stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
                     for code in (source, interactor)]
        log = []
        def observe(i):
            code = processes[i].poll()
            if code is None:
                return None
            return dict(status='' if code == 0 else 'RE', exitCode=max(0, code),
                        signal=max(0, -code), overflow=False, oom=False) | (statuses or {}).get(i, {})
        try:
            return interactive.relay(processes, observe, wall, log.append, capture), ''.join(log)
        finally:
            for p in processes:
                if p.poll() is None:
                    p.kill()
                p.wait()
                p.stdin.close()
                p.stdout.close()

    def test_bidirectional_binary_data_and_eof(self):
        captured = bytearray()
        result, log = self.run_pair(
            "import sys; x=sys.stdin.buffer.read(4); assert x==b'a\\x00\\r\\n'; sys.stdout.buffer.write(x); sys.stdout.flush(); assert sys.stdin.buffer.read()==b''",
            "import sys; sys.stdout.buffer.write(b'a\\x00\\r\\n'); sys.stdout.flush(); assert sys.stdin.buffer.read(4)==b'a\\x00\\r\\n'", capture=captured.extend)
        self.assertEqual(result, 'AC')
        self.assertEqual(captured, b'a\x00\r\n')
        self.assertIn('提出 → ジャッジ', log)
        self.assertIn('ジャッジ → 提出', log)

    def test_backpressure_and_eof_after_draining_buffer(self):
        result, _ = self.run_pair(
            "import sys; sys.stdout.buffer.write(b'x' * 1048576); sys.stdout.flush(); assert sys.stdin.read()=='ok'",
            "import sys,time; time.sleep(.05); x=b''\nwhile len(x)<1048576: x+=sys.stdin.buffer.read(min(4096,1048576-len(x)))\nassert x==b'x'*1048576; print('ok',end='')")
        self.assertEqual(result, 'AC')

    def test_rejection_does_not_wait_for_or_blame_peer(self):
        start = time.monotonic()
        result, _ = self.run_pair('import time; time.sleep(10)', 'assert False')
        self.assertEqual(result, 'WA')
        self.assertLess(time.monotonic()-start, 1)
        result, _ = self.run_pair('raise Exception()', 'import time; time.sleep(10)')
        self.assertEqual(result, 'RE')

    def test_acceptance_requires_submission_exit_and_waits_have_shared_deadline(self):
        for interactor in ('pass', 'input()'):
            result, log = self.run_pair('import time; time.sleep(10)', interactor, wall=.15)
            self.assertEqual(result, 'TLE')
            self.assertIn('経過時間超過', log)

    def test_each_direction_and_stderr_resource_failure(self):
        with patch.object(interactive.sandbox, 'OUTPUT_LIMIT', 10000):
            for i in (0, 1):
                codes = ['import time; time.sleep(10)'] * 2
                codes[i] = "import sys; sys.stdout.write('x'*20000); sys.stdout.flush(); import time; time.sleep(10)"
                result, _ = self.run_pair(*codes)
                self.assertEqual(result, 'OLE' if i == 0 else 'JE')
        for i in (0, 1):
            codes = ['import time; time.sleep(10)'] * 2
            codes[i] = 'pass'
            result, _ = self.run_pair(*codes, statuses={i: {'overflow': True}})
            self.assertEqual(result, 'OLE' if i == 0 else 'JE')

    def test_jobs_reject_conflicting_modes_and_bad_interactors(self):
        from test_checker import job
        request = job()
        request['interactor'] = request['checker']
        with self.assertRaises(ValueError):
            host.validate_job(request, 'sha256:test')
        del request['checker']
        for code in ({}, False, {'runtime': 'sh', 'source': 'x'}, {'runtime': 'python314', 'source': ''}):
            request['interactor'] = code
            with self.assertRaises(ValueError):
                host.validate_job(request, 'sha256:test')
        request['interactor'] = {'runtime': 'python314', 'source': 'input()'}
        for field in ('generate', 'validate'):
            request[field] = True
            with self.assertRaises(ValueError):
                host.validate_job(request, 'sha256:test')
            del request[field]
        host.validate_job(request, 'sha256:test')

    def test_host_pins_artifacts_private_data_metrics_and_bounded_diagnostics(self):
        from test_checker import job
        request = job()
        request['interactor'] = request.pop('checker')
        compiled = []
        def compile(request, compile_phase=False, **kwargs):
            self.assertTrue(compile_phase)
            compiled.append(request['runtime'])
            Path(kwargs.get('artifact', host.sandbox.ARTIFACT)).write_text(request['source'])
            return dict(compiled=True)
        def execute(job, case, artifact, diagnostic):
            self.assertEqual(host.sandbox.ARTIFACT.read_text(), 'submitted source')
            self.assertEqual(artifact.read_text(), 'assert True')
            self.assertEqual(case['output'], 'expected secret')
            diagnostic('あ' * 20000)
            return dict(verdict='AC', cpuTimeMs=7, wallTimeMs=20, memoryBytes=512)
        with tempfile.TemporaryDirectory() as tmp, patch.object(host.sandbox, 'ARTIFACT', Path(tmp)/'main'), \
                patch.object(host.sandbox, 'META', Path(tmp)/'meta'), \
                patch.object(host.sandbox, 'execute', compile), patch.object(interactive, 'execute', execute):
            result = host.judge(request, 'sha256:test')
            self.assertEqual(list(Path(tmp).iterdir()), [])
        self.assertEqual(compiled, ['cpp17-isolate', 'python314-isolate'])
        self.assertEqual(result['passed'], 2)
        self.assertEqual(result['cases'][0]['cpuTimeMs'], 7)
        self.assertLessEqual(len(result['checkerLog'].encode()), 16384)
