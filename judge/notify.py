"""SNS CloudWatch state changes to Discord. No webhook URLs in errors/logs."""
import json
import os
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def notification(alarm):
    name = alarm['AlarmName']
    state = alarm['NewStateValue']
    author = name.endswith('-judge-code')
    title = '作問コードの確認が必要' if author else 'ジャッジ基盤の異常'
    if state == 'OK':
        title = '作問コード：直近の検出なし' if author else 'ジャッジ監視の復旧'
    region = os.environ['AWS_REGION']
    console = f'https://{region}.console.aws.amazon.com/cloudwatch/home?region={region}'
    content = (f"[{os.environ['ENVIRONMENT']}] {title}\n{name}\n"
               f"状態: {state}\n時刻: {alarm['StateChangeTime']}\n"
               f"理由: {alarm.get('NewStateReason', '')[:500]}\n"
               f"{console}#alarmsV2:alarm/{quote(name, safe='')}\n"
               f"ログ検索: {os.environ['LOGS_URL']}")
    return {'content': content[:1900], 'allowed_mentions': {'parse': []}}


def send(webhook, payload):
    parsed = urlsplit(webhook)
    if parsed.scheme != 'https' or parsed.netloc != 'discord.com' or not parsed.path.startswith('/api/webhooks/') or parsed.fragment:
        raise RuntimeError('invalid Discord webhook configuration')
    request = Request(webhook, data=json.dumps(payload).encode(),
                      headers={'Content-Type': 'application/json', 'User-Agent': 'JudgeAlerts/1.0'}, method='POST')
    opener = build_opener(NoRedirect())
    for attempt in range(3):
        try:
            with opener.open(request, timeout=10) as response:
                if response.status not in (200, 204):
                    raise RuntimeError('Discord delivery failed')
            return
        except HTTPError as error:
            if error.code == 429 and attempt < 2:
                try:
                    delay = float(json.loads(error.read(4096)).get('retry_after', 1))
                except (ValueError, TypeError):
                    delay = 1
                if 0 <= delay <= 5:
                    error.close()
                    time.sleep(delay)
                    continue
            error.close()
            raise RuntimeError('Discord delivery failed') from None
        except Exception:
            raise RuntimeError('Discord delivery failed') from None


def handler(event, context):
    import boto3
    try:
        webhook = boto3.client('secretsmanager').get_secret_value(SecretId=os.environ['WEBHOOK_SECRET_ARN'])['SecretString'].strip()
        if os.environ.get('WEBHOOK_SECRET_KEY'):
            webhook = json.loads(webhook)[os.environ['WEBHOOK_SECRET_KEY']].strip()
        for record in event['Records']:
            alarm = json.loads(record['Sns']['Message'])
            if alarm['NewStateValue'] in ('ALARM', 'OK'):
                send(webhook, notification(alarm))
    except Exception:
        # SDK/urllib exceptions can contain URLs and credentials. Lambda retries
        # and eventually writes the original SNS event (no webhook) to its DLQ.
        raise RuntimeError('alert delivery failed; inspect notification DLQ and configuration') from None
