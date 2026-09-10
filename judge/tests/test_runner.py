import base64
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sandbox
import host


class RunnerTests(unittest.TestCase):
    def test_missing_and_nonfinite_measurements_fail_closed(self):
        for text in ['time:0\ntime-wall:0', 'time:nan\ntime-wall:0\ncg-mem:1',
                     'status:XX\ntime:0\ntime-wall:0\ncg-mem:1']:
            with self.assertRaises((KeyError, ValueError, RuntimeError)):
                sandbox.metadata(text)
        self.assertEqual(sandbox.metadata('time:0.125\ntime-wall:0.3\ncg-mem:2048')['memoryBytes'], 2097152)

    def test_signal_137_is_not_automatically_mle(self):
        reply = dict(index=0, status='SG', oom=False, overflow=False, exitCode=0, signal=9,
                     cpuTimeMs=1, wallTimeMs=1, memoryBytes=4096, output='')
        case = {'output': ''}
        self.assertEqual(host.case_result(reply, 0, case)['verdict'], 'RE')
        reply['oom'] = True
        self.assertEqual(host.case_result(reply, 0, case)['verdict'], 'MLE')
        reply.update(oom=False, status='TO')
        self.assertEqual(host.case_result(reply, 0, case)['verdict'], 'TLE')
        reply['overflow'] = True
        self.assertEqual(host.case_result(reply, 0, case)['verdict'], 'OLE')
        reply['memoryBytes'] = float('nan')
        with self.assertRaises(ValueError): host.case_result(reply, 0, case)

    def test_judge_keeps_expected_output_private_and_compiles_once(self):
        calls = []
        def execute(request, compile_phase=False):
            calls.append((request, compile_phase))
            if compile_phase:
                return {'compiled': True, 'compileLog': ''}
            return dict(status='', oom=False, overflow=False, exitCode=0, signal=0,
                        cpuTimeMs=0, wallTimeMs=1, memoryBytes=1024,
                        output=base64.b64encode(b'3\n').decode())
        job = dict(runtime='cpp17-isolate', runtimeDigest='sha256:test', source='int main(){}',
                   memoryLimitMb=512, timeLimitMs=1000,
                   cases=[dict(name='a', input='1', output='3'), dict(name='b', input='2', output='secret')])
        import tempfile
        with tempfile.TemporaryDirectory() as tmp, patch.object(sandbox, 'execute', execute), \
                patch.object(sandbox, 'ARTIFACT', Path(tmp) / 'main'), \
                patch.object(sandbox, 'META', Path(tmp) / 'meta'):
            result = host.judge(job, 'sha256:test')
        self.assertEqual(result['verdict'], 'WA')
        self.assertEqual(result['passed'], 1)
        self.assertEqual([compile_phase for _, compile_phase in calls], [True, False, False])
        self.assertNotIn('secret', str(calls))
        self.assertEqual(result['cases'][0]['cpuTimeMs'], 0)

    def test_cleanup_failure_stops_worker(self):
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'box').mkdir()
            def invoke(args, **kwargs):
                if args == ['--init']:
                    return subprocess.CompletedProcess([], 0, (tmp+'\n').encode())
                if args == ['--cleanup']:
                    return subprocess.CompletedProcess([], 1)
                raise RuntimeError('simulated execution failure')
            with patch.object(sandbox, 'invoke', invoke), patch.object(sandbox, 'META', Path(tmp) / 'meta'):
                with self.assertRaises(SystemExit):
                    sandbox.execute({'source': 'int main(){}'}, True)

    def test_pointer_rejects_other_object_paths(self):
        import json
        item = dict(submissionId='11111111-1111-4111-8111-111111111111',
                    attemptId='22222222-2222-4222-8222-222222222222',
                    sha256='a' * 64, versionId='version')
        item['key'] = f"jobs/{item['submissionId']}/{item['attemptId']}.json"
        self.assertEqual(host.pointer(json.dumps(item)), item)
        item['key'] = 'releases/worker.tar.gz'
        with self.assertRaises(ValueError): host.pointer(json.dumps(item))

    def test_regular_read_rejects_symlink(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'output'
            path.symlink_to('/etc/passwd')
            with self.assertRaises(OSError): sandbox.regular_read(path, 10)


if __name__ == '__main__':
    unittest.main()
