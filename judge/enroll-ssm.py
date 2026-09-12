#!/usr/bin/env python3
"""Enroll a rebuilt Lightsail host over verified SSH; never log activation secrets."""
import json
import os
import subprocess
import time


def aws(*args):
    return json.loads(subprocess.check_output(['aws', *args, '--output', 'json']) or '{}')


if __name__ == '__main__':
    target = 'ubuntu@' + os.environ['JUDGE_IPV6']
    role = os.environ['JUDGE_SSM_ROLE']
    region = os.environ.get('AWS_DEFAULT_REGION', 'ap-northeast-1')
    name = os.environ.get('JUDGE_INSTANCE_NAME', 'judge-dev-judge-worker')
    activation = aws('ssm', 'create-activation', '--region', region, '--iam-role', role,
                     '--registration-limit', '1', '--default-instance-name', name)
    script = r'''
import json,sys,subprocess,urllib.request
from pathlib import Path
config=json.load(sys.stdin)
region=config['region']
directory=Path('/etc/amazon/ssm'); directory.mkdir(parents=True,exist_ok=True)
(directory/'amazon-ssm-agent.json').write_text(json.dumps({
    'Ssm': {'Endpoint': 'ssm.'+region+'.api.aws'},
    'Mgs': {'Endpoint': 'ssmmessages.'+region+'.api.aws'},
    'Agent': {'Region':region, 'UseDualStackEndpoint': True}, 'Profile': {'KeyAutoRotateDays': 30, 'ShareCreds': False}
}))
agent='/snap/amazon-ssm-agent/current/amazon-ssm-agent'
service='snap.amazon-ssm-agent.amazon-ssm-agent.service'
if not Path(agent).exists():
    url='https://amazon-ssm-'+region+'.s3.dualstack.'+region+'.amazonaws.com/latest/debian_amd64/amazon-ssm-agent.deb'
    urllib.request.urlretrieve(url,'/tmp/judge-ssm-agent.deb')
    subprocess.run(['dpkg','-i','/tmp/judge-ssm-agent.deb'],check=True,stdout=subprocess.DEVNULL)
    agent='/usr/bin/amazon-ssm-agent'
    service='amazon-ssm-agent.service'
subprocess.run(['systemctl','stop',service],check=True)
registered=subprocess.run([agent,'-register','-code',config['ActivationCode'],'-id',config['ActivationId'],'-region',region],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if registered.returncode:
    raise SystemExit('SSM registration failed; inspect agent logs on the host')
subprocess.run(['systemctl','enable','--now',service],check=True)
Path('/tmp/judge-ssm-agent.deb').unlink(missing_ok=True)
'''
    import shlex
    ssh = ['ssh', '-6', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']
    if os.environ.get('JUDGE_SSH_BIND'):
        ssh += ['-b', os.environ['JUDGE_SSH_BIND']]
    try:
        subprocess.run([*ssh, target, 'sudo python3 -c ' + shlex.quote(script)],
                       input=json.dumps(dict(activation, region=region)).encode(), check=True)
        for _ in range(30):
            nodes = aws('ssm', 'describe-instance-information', '--region', region,
                        '--filters', 'Key=ActivationIds,Values=' + activation['ActivationId'])
            if any(node['PingStatus'] == 'Online' for node in nodes['InstanceInformationList']):
                print(next(node['InstanceId'] for node in nodes['InstanceInformationList'] if node['PingStatus'] == 'Online'))
                break
            time.sleep(5)
        else:
            raise SystemExit('SSM did not become Online; keep restricted SSH enabled')
    finally:
        aws('ssm', 'delete-activation', '--region', region, '--activation-id', activation['ActivationId'])
