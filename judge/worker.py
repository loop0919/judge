#!/usr/bin/python3
"""SQS/S3 transport; runs as a single systemd-managed slot on the Lightsail host."""
import hashlib
import json
import logging
import os
import signal
import time

import boto3
from botocore.config import Config
from host import judge, prepare_cgroup, verify_assets, pointer, slot


def read_test_file(s3, bucket, item):
    response = s3.get_object(Bucket=bucket, Key=item['key'], VersionId=item['versionId'])
    with response['Body'] as stream:
        data = stream.read(item['size'] + 1)
    if len(data) != item['size'] or hashlib.sha256(data).hexdigest() != item['sha256'] or b'\0' in data:
        raise ValueError('test file integrity')
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError as error:
        raise ValueError('test file encoding') from error


def main():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    runtime = verify_assets()
    if runtime != os.environ['JUDGE_RUNTIME_DIGEST']:
        raise ValueError('configured runtime does not match assets')
    cgroup = prepare_cgroup()
    config = Config(connect_timeout=5, read_timeout=30, retries={'max_attempts': 3}, use_dualstack_endpoint=True)
    sqs = boto3.client('sqs', config=config)
    s3 = boto3.client('s3', config=config)
    requests = os.environ['JUDGE_REQUEST_QUEUE_URL']
    results = os.environ['JUDGE_RESULT_QUEUE_URL']
    bucket = os.environ['JUDGE_JOB_BUCKET']
    test_bucket = os.environ.get('JUDGE_TEST_DATA_BUCKET', '')
    while True:
        try:
            if verify_assets() != runtime:
                raise SystemExit('runtime changed')
            messages = sqs.receive_message(QueueUrl=requests, MaxNumberOfMessages=1, WaitTimeSeconds=20,
                                           VisibilityTimeout=2100).get('Messages', [])
            for message in messages:
                # Invalid queue envelopes go to the DLQ; never fetch arbitrary S3 keys.
                item = pointer(message['Body'])
                response = s3.get_object(Bucket=bucket, Key=item['key'], VersionId=item['versionId'])
                with response['Body'] as stream:
                    data = stream.read(2 * 1024 * 1024 + 1)
                if len(data) > 2 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != item['sha256']:
                    raise ValueError('job integrity')
                job = json.loads(data)
                if any(job[name] != item[name] for name in ('submissionId', 'attemptId')):
                    raise ValueError('job identity')
                try:
                    result = judge(job, runtime, lambda item: read_test_file(s3, test_bucket, item))
                except Exception:
                    # Avoid logging source, test data, credentials, or sandbox diagnostics.
                    logging.error('judge failed')
                    result = {'verdict': 'JE', 'passed': 0, 'total': 0}
                    for child in cgroup.iterdir():
                        if child.is_dir() and child.name != 'controller' and (child / 'cgroup.procs').read_text().strip():
                            raise SystemExit('isolate cleanup failed; refusing another job')
                payload = {'submissionId': item['submissionId'], 'attemptId': item['attemptId'], 'result': result}
                sqs.send_message(QueueUrl=results, MessageBody=json.dumps(payload, allow_nan=False, ensure_ascii=False))
                sqs.delete_message(QueueUrl=requests, ReceiptHandle=message['ReceiptHandle'])
                logging.info('completed submission=%s verdict=%s', item['submissionId'], result['verdict'])
        except Exception:
            logging.error('queue processing failed; message will be retried')
            time.sleep(5)


if __name__ == '__main__':
    # SIGTERM exits through Python finally blocks, then systemd kills any remaining children.
    def stop(signum, frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    with slot():
        main()
