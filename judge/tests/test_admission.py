import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from admission import publication


class AdmissionTests(unittest.TestCase):
    def test_only_passed_runtimes_can_be_published(self):
        report = {'runtimeDigest': 'sha256:' + 'a' * 64,
                  'passedRuntimes': ['cpp17-isolate', 'c23-gcc-isolate']}
        self.assertEqual(publication(report, 'cpp17,c23-gcc'),
                         (report['runtimeDigest'], 'cpp17,c23-gcc'))
        for requested in ('java24', 'cpp17,java24', '', 'cpp17,'):
            with self.assertRaises(ValueError):
                publication(report, requested)

    def test_unpinned_report_is_rejected(self):
        for digest in ('latest', '', 'sha256:' + 'x' * 64):
            with self.assertRaises(ValueError):
                publication({'runtimeDigest': digest, 'passedRuntimes': ['cpp17-isolate']}, 'cpp17')

    def test_malformed_or_contradictory_report_is_rejected(self):
        for extra in ({'passedRuntimes': 'cpp17-isolate-unverified'},
                      {'passedRuntimes': ['cpp17-isolate'], 'failedRuntimes': ['cpp17-isolate']}):
            with self.assertRaises(ValueError):
                publication({'runtimeDigest': 'sha256:' + 'a' * 64, **extra}, 'cpp17')
