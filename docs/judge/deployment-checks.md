# 配布と検証の定型コマンド

APIとfrontendは既存のGitHub Actionsで配布する。
ジャッジの長時間検証はSSM上で動かし、AIに待機や繰り返しのログ確認をさせない。
運用者は配布を開始した後、保存されたJSONと終了コードで合否を確認する。
新しいランタイム、OS更新、ホスト増設でも実機検証を省略しない。

## 配布前の条件

[ランタイムの再構築と公開](runtime-rollout.md)に従い、APIの受付を止めてから、DBの未dispatch提出と処理中の提出、SQSの要求と結果が空になるまで待つ。
空になった後にdispatchと結果受信を止め、全workerを停止する。
SQSが空というだけでは、DBの未dispatch提出がないことを保証できない。
これらの操作、バックアップ、bridgeの先行配布、SSM登録、インフラの変更は今回のスクリプトの自動化対象に含めない。
失敗時に受付を自動再開する処理も置かない。

以下はリポジトリルートで実行する。
AWS CLIのprofileとregionを設定し、SSMノードはTerraformのホスト一覧と照合する。
新しい配布ごとに異なる実行ディレクトリを使う。
既存のディレクトリは上書きしない。

```sh
export AWS_PROFILE=loop0919
export AWS_DEFAULT_REGION=ap-northeast-1
export JUDGE_RELEASE_RUN="judge/.build/rollout-$(date -u +%Y%m%dT%H%M%SZ)"
export JUDGE_NODE_1=mi-08a9ccbdc9116b369
export JUDGE_NODE_2=mi-07cb78f3b979951e7
export JUDGE_RELEASE_BUCKET=judge-dev-judge-5983370c65ca9cd6b9cd685c8d
mkdir -p "$JUDGE_RELEASE_RUN"
```

## 配布の開始と回収

既存の`deploy-ssm.py`で、SHA-256を固定した配布物を送る。
`--no-wait`ならSSMコマンドの登録後に戻る。
停止済みの各ホストに対して実行する。
例では配布物は事前に`judge/.build/worker.tar.gz`へ構築済みとする。

```sh
python3 judge/deploy-ssm.py --instance "$JUDGE_NODE_1" --bucket "$JUDGE_RELEASE_BUCKET" \
  --run-dir "$JUDGE_RELEASE_RUN/install-1" --no-wait
python3 judge/deploy-ssm.py --instance "$JUDGE_NODE_2" --bucket "$JUDGE_RELEASE_BUCKET" \
  --run-dir "$JUDGE_RELEASE_RUN/install-2" --no-wait
```

次の`collect --wait`は通常のPythonプロセスで待機する。
AIのツール呼び出しで待ち続ける必要はない。
端末を閉じる場合は`nohup`やtmuxを使う。
途中でローカルの待機が止まってもSSMの処理は続き、同じディレクトリで結果を再取得できる。

```sh
python3 judge/verify.py collect --run-dir "$JUDGE_RELEASE_RUN/install-1" --wait
python3 judge/verify.py collect --run-dir "$JUDGE_RELEASE_RUN/install-2" --wait
```

## 全ホストの実機検証

両ホストの配布が成功してから実行する。
全ランタイムのsmokeを両ホストで同時に開始する。
開始だけなら待機は発生しない。

```sh
python3 judge/verify.py submit --run-dir "$JUDGE_RELEASE_RUN/verify" \
  --instance "$JUDGE_NODE_1" --instance "$JUDGE_NODE_2"
nohup python3 judge/verify.py collect --run-dir "$JUDGE_RELEASE_RUN/verify" --wait \
  > "$JUDGE_RELEASE_RUN/verify-wait.log" 2>&1 < /dev/null &
```

初回ディスク読み込みを含め、smokeサービスには90分の待機上限を設ける。
検証は既存の`smoke.sh`を使い、言語の一部だけを選択する環境変数は解除する。
失敗時の詳細ログは、対象ホストの`/var/lib/judge-verification/<runId>/smoke.log`に残る。
`runId`とSSMコマンドIDはローカルの`receipt.json`に記録される。

## 起動と公開

全ホストで同じdigestと同じランタイム一覧が合格した場合だけ起動できる。
起動後は、そのsystemd起動回に属する`worker_started`を待つ。
単にプロセスが存在するだけでは合格にしない。
dispatchと結果受信は、この確認が終わるまで停止したままにする。

```sh
python3 judge/verify.py start --run-dir "$JUDGE_RELEASE_RUN/verify"
nohup python3 judge/verify.py collect --run-dir "$JUDGE_RELEASE_RUN/verify" --wait \
  > "$JUDGE_RELEASE_RUN/start-wait.log" 2>&1 < /dev/null &
```

`collect`が成功すると、`report.json`の`ready`が`true`になる。
そのレポートを既存の`admission.py`へ渡す。
複数ホストを含むレポートは、全ホストの起動完了を確認できなければ公開を拒否する。
公開対象の言語一覧は承認済みの一覧を指定し、smokeに通った全言語を自動公開しない。

公開前にbridgeのdigestをレポートと一致させ、dispatchと結果受信を再開する。
公開後はGitHub Environmentの`JUDGE_RUNTIME_DIGEST`、`JUDGE_ENABLED_RUNTIMES`とTerraform設定を同期する。
これらの設定変更は[配布手順](runtime-rollout.md)に従う。

```sh
python3 judge/admission.py --function judge-dev-api \
  --smoke-report "$JUDGE_RELEASE_RUN/verify/report.json" \
  --runtimes "$JUDGE_APPROVED_RUNTIMES"
```

## 本番APIでの確認

Python 3.14の公開後、次のコマンドで一時的な非公開問題を作成して確認する。
Cognitoの招待メールは送信しない。
4件の提出で、非連続の累計2回TLE、TLEが1回の場合、サンプル検証を確認する。
2台のIDを渡した場合は、両ホストのログに採点区間の重なりがあることも必須とする。
キューの分配によって同時採点を観測できなかった場合も失敗として返すため、結果を確認して新しいレポート名で再実行する。

```sh
python3 judge/smoke-api.py --function judge-dev-api --api-url https://api.share-oj.net \
  --instance "$JUDGE_NODE_1" --instance "$JUDGE_NODE_2" \
  --report "$JUDGE_RELEASE_RUN/api-report.json"
```

成功時は一時問題と一時アカウントを削除してから`status: passed`を保存する。
プロフィールと提出の監査記録は残る。
後片付けに失敗した場合やプロセスが中断された場合は、同じ引数に`--cleanup`を追加する。
対象を`api-report.cleanup.json`に保存するため、AIがユーザー名をログから探し直す必要はない。
このファイルにパスワードやトークンは保存しない。

## 終了コードと記録

| コマンド | 0 | 1以上 |
| --- | --- | --- |
| `deploy-ssm.py --no-wait` / `verify.py submit` / `verify.py start` | SSM登録済み（処理完了ではない） | 登録失敗 |
| `verify.py collect` | 対象ホストすべて成功 | 3は処理中、1は失敗 |
| `smoke-api.py` | 判定確認と後片付けが成功 | 検証または後片付けに失敗 |

`status.json`は直近の回収結果であり、バックグラウンドの回収プロセスを起動していなければ自動更新されない。
SSMがまだ処理中なら、同じ`collect`で再開する。
SSM自体が失敗した場合は原因を解消して新しい実行ディレクトリで検証し直す。
SSM登録直後からIDの保存までの間にプロセスが中断された場合、`collect`は不足IDを検出して停止する。
その場合はSSMのコメントにあるrunIdから登録済みコマンドを確認し、二重に配布を開始しない。

配布記録にはコミット、配布物SHA-256、`receipt.json`、`report.json`、API検証結果を残す。
通常は結果JSONだけを確認し、失敗時に限ってAIへ該当ログを渡す。

## 自動テスト

```sh
python3 -m unittest discover -s judge/tests -v
```

既存CIがこのコマンドを実行するため、追加のCI設定は不要である。
AWS呼び出しを模擬し、ホスト欠落、digest不一致、古いrunId、実機テスト失敗、起動前の公開拒否、APIテストと後片付けを検証する。
実機の23ランタイムテストと本番APIテストは運用時に実行し、単体テストで代替しない。
