# ランタイムの再構築と段階公開

[ADR 0007](../adr/0007-limit-judge-runtime-libraries.md)のランタイムを同じworkerへ配置し、検証済みの言語だけをAPIへ公開する。
コンパイラの配置と提出受付の有効化は別の操作である。
以下のコマンドはリポジトリのルートから実行する。
AWS CLIには操作対象のprofileとリージョンを設定しておく。

## 受付停止と退避

最初にAPIの受付を停止し、キューに残った提出を旧workerで処理する。
workerが故障している場合は、未処理提出の扱いを決めてから交換する。
旧digestの提出を新しい環境で黙って採点し直さない。

```sh
python3 judge/admission.py --function judge-dev-api --pause
```

要求キューの可視メッセージと処理中メッセージがなくなったら、`infra/judge`の`enabled=false`を適用する。
これはdispatchと結果受信を停止する。
workerサービスも停止し、交換するインスタンスのスナップショットが`available`になったことを確認する。
TerraformのplanでDB、ジョブ用S3、キューが削除対象に含まれないことを確認する。

## ランタイム配布物の構築

ビルドにはUbuntu 24.04 x86_64のDocker環境と、配布物を展開できるディスク容量を用意する。
コンパイラのビルドは2 GBのworker上では実行しない。
取得元とSHA-256は`judge/runtime-sources.lock.json`、Rustの推移的依存は`judge/rust-Cargo.lock`へ固定している。
通常の再構築では`--lock`を指定しない。
版を更新する場合だけ取得元を確認してlockを更新し、新しいdigestで全テストをやり直す。

```sh
python3 judge/prepare-runtime-inputs.py
docker build -f judge/runtime.Dockerfile -t openoj-runtime:adr0007 judge
docker create --name openoj-runtime-export openoj-runtime:adr0007
docker cp openoj-runtime-export:/runtime.tar.gz judge/.build/runtime.tar.gz
docker rm openoj-runtime-export
make -C api package package-judge
bash judge/build-assets.sh
```

`runtime.tar.gz`にはC23のGCC版とClang版、C++23のGCC版とClang版、CPython、PyPy、Codon、Rust、Javaを含める。
復旧用のC++17はworker OSのGCCを使う。
追加ライブラリと引数は`judge/runtimes.py`、正確な配布版はsource lockを参照する。
CodonはCPython互換の全構文を保証せず、CPython連携とPyPIパッケージを提供しない。

## workerの作成とSSM登録

初回だけ`ssh_enabled=true`にし、`admin_ipv6_cidr`へ操作端末の現在のIPv6 `/128`を指定する。
IPv6全体へSSHを開けない。
ホストのnftablesはDHCP応答と、cloud-initが使う`169.254.169.254:80`への通信を許可する。
この許可は管理ホスト向けであり、提出のネットワーク名前空間は外部につながない。
同名インスタンスの交換でもLightsailの公開ポート設定を再適用する。

Terraformを適用し、新workerのSSHホスト鍵を確認してcloud-initの完了を待つ。
SSM登録スクリプトは有効回数1回のhybrid activationを作り、秘密値をSSH標準入力で渡し、登録後にactivationを削除する。
SSM Agentはdual-stackエンドポイントへ接続する。

```sh
export JUDGE_IPV6='作成したworkerのIPv6'
export JUDGE_SSH_BIND='操作端末の許可済みIPv6'
export JUDGE_SSM_ROLE='judge-dev-judge-ssm'
ssh -6 -b "$JUDGE_SSH_BIND" "ubuntu@$JUDGE_IPV6" 'sudo cloud-init status --wait'
python3 judge/enroll-ssm.py
```

表示された`mi-...`を以後のSSM管理対象IDとして使う。
Session Managerの接続にはAWS CLI用Session Manager pluginも必要である。

```sh
aws ssm start-session --target mi-REPLACE
```

再起動し、同じSSM登録とSSHホスト鍵が維持されることを確認する。
`PingStatus=Online`だけで判断せず、再起動後のRun Commandが成功することを確認する。
SSH鍵が予期せず変わった場合は検証を無効化せず、AWS側の対象と起動状態を調べる。

worker用IAMキーはSSM登録情報と別に管理する。
キーをTerraform、user-data、SSMのコマンド履歴、Gitへ含めず、検証済みSSH接続で`/root/.aws/credentials`へ配置する。
所有者root、モード0600とし、既存キーを削除するときは、そのキーを使うホストへの影響を確認する。
SSM Agentの`ShareCreds=false`によりworker用credentialsへの上書きを防ぐ。
配置後は`ssh_enabled=false`を適用する。
この変更だけではworkerは交換されないため、日々の操作端末IPv6の変化に追従する必要がなくなる。

## 配置と実機smoke test

配布スクリプトは専用S3へSHA-256を含むキーで配布物を置き、SSMからダウンロードして検証する。
インストール終了時も採点サービスは停止したままとする。

```sh
python3 judge/deploy-ssm.py --instance mi-REPLACE --bucket REPLACE
```

インストールが成功したらSSMで次を実行する。
OSパッケージの更新で再起動が必要なら、先に再起動し、SSM復帰後にfingerprintを生成し直す。

```sh
sudo /usr/bin/python3 /opt/judge/fingerprint.py
sudo /opt/judge/smoke.sh
```

smokeは本番と同じsystemd制限で実行し、まずC++17でAC、WA、CE、TLE、MLE、OLE、プロセス数、秘密ファイルの非公開、IMDS接続拒否、ケース間のファイル破棄を確認する。
続いて各ランタイムのAC、WA、CE、TLEと採用ライブラリを確認する。
NumPyとSciPyはスレッド数を1に制限して512 MiB以内で実行し、Javaは内部クラスを含む成果物を次のケースへ渡せることも確認する。

共通の隔離テストを通過すると、言語別検証の最後に`runtimeDigest`、`passedRuntimes`、`failedRuntimes`を含むJSONをjournalへ出力する。
そのJSON本体を、操作端末の`judge/.build/smoke-report.json`へ保存する。
言語別に失敗した場合はサービスも失敗として終了するが、公開できるのは`passedRuntimes`に含まれる言語だけである。
共通の隔離テストが失敗した場合はレポートを出力しない。
別workerの結果や、後で環境を変更した古いレポートを公開判定へ流用しない。
個別再検証は`sudo JUDGE_SMOKE_RUNTIMES=c23-gcc-isolate,c23-clang-isolate /opt/judge/smoke.sh`のように指定する。
個別実行のレポートでは、指定したランタイムだけが公開可能になる。

## C++17からの段階公開

APIのマイグレーションは`008_judge_progress.sql`まで適用し、API、bridge、webを対応版へ配置しておく。
実機で得たdigestを`infra/judge`の`runtime_digest`へ設定し、まだ`enabled=false`で適用する。
`worker_environment`出力を`/opt/judge/worker.env`へroot所有、0600で配置する。
SSMでworkerを起動し、認証とdigest検証で終了しないことを確認してから`enabled=true`を適用する。

最初はC++17だけを公開する。

```sh
python3 judge/admission.py --function judge-dev-api \
  --smoke-report judge/.build/smoke-report.json --runtimes cpp17
```

実際のAPIからテスト提出し、結果がDBへ戻ることを確認する。
次の各段階でも実際の提出結果を確認し、失敗した言語は公開リストへ追加しない。

| 段階 | 公開リストへ追加するID |
| --- | --- |
| 復旧 | `cpp17` |
| C | `c23-gcc,c23-clang` |
| Python | `python314,pypy311,codon020` |
| Rust | `rust2024` |
| Java（公開保留） | `java24` |
| C++23 | `cpp23-gcc,cpp23-clang` |

2026年9月12日の追加決定により、OpenJDK 24の公開は保留する。
Javaのsmokeが通っても、保守されている版の採用を別途決めるまで`java24`を公開リストへ入れない。

`--runtimes`には追加分だけでなく、それまでの公開言語も含めた一覧を渡す。
スクリプトはレポートの未検証言語を拒否し、APIの既存環境変数を維持して公開リストを更新する。
`GET /runtimes`と提出受付は同じ設定を参照するため、未公開言語をAPIへ直接送っても受理しない。

公開後はAPIのTerraform変数`judge_runtime_digest`と`judge_enabled_runtimes`、GitHub Actionsのリポジトリ変数`JUDGE_RUNTIME_DIGEST`と`JUDGE_ENABLED_RUNTIMES`を同じ値へそろえる。
GitHub側の言語リストは`["cpp17","c23-gcc"]`のようなJSON配列で指定する。
CIは有効化するdigestと言語一覧を現在のAPI公開設定と照合し、不一致ならapply前に停止する。
新しい言語の公開は実機smoke後に`admission.py`で行い、CI側の変数を追従させる。

## 失敗時の停止条件

管理接続、隔離、メモリ制限、digest照合のいずれかが失敗した場合は公開しない。
稼働中に問題が見つかった場合は、最初に`admission.py --pause`で受付を停止し、要求キューと処理中提出を確認する。
別digestへの切替時は再度drainを行う。
提出を処理した後のworker交換では、新たに保存すべきデータがないか確認してから退避する。
退避スナップショットには古い認証情報も残り得るため、アクセス制限と不要になったキーの失効を管理する。

## 即時投入と進捗表示

提出APIはDBへの保存後、`JUDGE_DISPATCH_FUNCTION`で指定した既存bridgeを非同期起動する。
呼び出しの受理を最大2秒待ち、採点の完了は待たない。
呼び出しに失敗しても保存済みの提出は202で受理し、1分ごとのdispatchが未投入の提出を回収する。
定期dispatchは廃止しない。
APIの実行ロールには同じ環境のbridgeに限った`lambda:InvokeFunction`権限を与える。

要求キューへ送っただけでは`RUNNING`に変更しない。
workerの進捗通知を既存の結果キューで受け、現在のattemptに限って状態を進める。
古い通知や重複通知で段階と完了ケース数を戻さず、`DONE`になった提出は変更しない。

| 実処理 | APIの状態 | 画面表示 |
| --- | --- | --- |
| workerを待っている | `QUEUED` | スピナーと`WJ` |
| workerがコンパイルなどを実行している | `RUNNING`、`PREPARING` | スピナーと`WJ` |
| コンパイルを終え、ケースを実行している | `RUNNING`、`JUDGING` | スピナーと`0/件数`から始まる完了ケース数 |
| 最終結果を保存した | `DONE` | スピナーなしで`完了（AC）`など |

進行中の表示はフォーカスでき、説明は「ジャッジ中」とする。
ケース数の進捗通知は原則1秒に1回まで、段階の切替は直ちに送信する。
進捗通知が失敗した場合はその提出の通知を打ち切り、採点と最終結果の送信を続ける。
提出詳細と履歴は未完了の提出がある間、応答後2秒で再取得する。
短い段階は画面の取得間隔に収まるため、すべての段階が画面に現れるとは限らない。

## OS更新後の再検証

2026年9月12日の承認により、OS更新は計画メンテナンスで適用する。
インストーラーは`apt-daily-upgrade.timer`を無効にし、`APT::Periodic::Unattended-Upgrade`を`0`に設定する。
`apt-daily.timer`によるパッケージ一覧の取得は維持する。
定期的にセキュリティ更新を確認し、緊急の修正が出た場合はメンテナンスを前倒しする。
自動適用を止める設定だけでは、セキュリティ更新の運用は完了しない。

workerは起動時とジョブ取得前に、OSパッケージ一覧とカーネルを検証済み環境と照合する。
OSの自動更新でもこの照合は失敗するため、更新後にworkerを再起動するだけでは復旧しない。
受付停止とキューのdrainを確認し、更新が完了してから必要な再起動を行う。
続いてfingerprintの再生成、全smoke、workerとbridgeのdigest更新を行う。
C++17だけを公開して実提出を確認し、残る検証済み言語も段階公開する。
更新前のレポートを流用したり、照合を無効にして再開したりしない。

受付停止、drain、dispatch停止、worker停止を終えたホストで、次のコマンドにより更新候補を確認する。
表示された追加、更新、削除の内容を確認してから適用する。

```sh
sudo apt-get update
sudo apt-get -s full-upgrade
sudo apt-get full-upgrade
sudo reboot
```

再起動後は「配置と実機smoke test」からやり直し、新digestをAPI、bridge、worker、CI変数へ反映する。

## 2026年9月12日の実施記録

workerを再構築し、再起動後のSSM Run CommandとSession Manager接続を確認した。
LightsailのSSH公開ポートは閉じている。
旧workerのスナップショット`judge-dev-worker-before-adr0007-20260912`は退避用に保持する。

| 項目 | 値 |
| --- | --- |
| worker | `judge-dev-judge-worker` |
| SSM管理対象 | `mi-08a9ccbdc9116b369` |
| runtime digest | `sha256:10047476b58253f8f6d657187cccb70b48ad5260031853f74f3a28626d3a6b61` |
| 配布物SHA-256 | `bde49ffcaa566ef3d60288241cf825746826ce25631427125930b4c500eb797b` |
| 実機smokeのSSMコマンドID | `03875889-2430-4d9c-a13c-f2f19782aca4` |

配布物は専用ジョブバケットの`releases/<配布物SHA-256>/worker.tar.gz`に保存した。
実機smokeはOS更新後の16:15 JSTに成功し、共通の隔離テストと全10ランタイムのAC、WA、CE、TLE、採用ライブラリの確認が通った。
OpenJDK 24は配置と検証までとし、ユーザーの決定により公開を保留する。
Pythonの単体テスト16件、APIのGoテスト、Terraformのjudge 5件とAPI 7件、webの型検査・Lambdaテスト・ブラウザ検証も通過した。

APIとwebの対応コード、DBマイグレーション007は配置済みである。
bridgeとworkerの設定は上記digestにそろえた。
workerサービスは起動し、自動起動も有効にした。
実提出の往復検証と段階公開は完了し、Javaを除く9ランタイムを公開した。
最初のC++17提出は通常の定期dispatchで処理し、以降も各段階のACを確認してから公開範囲を広げた。
公開後のworkerは再起動0回で稼働し、要求キュー、結果キュー、両方の失敗キューは可視、処理中、遅延のすべてが0件だった。
追加承認を受けて作成した一時Cognitoアカウントと一時公開問題は、検証後に削除した。
プロフィールと提出の監査記録は残る。

15:47 JSTからのOS自動更新で環境が変わり、workerが安全停止した。
カーネルやホスト側Pythonなどの更新完了後に再起動し、新カーネル`7.0.0-1012-aws`で全smokeを再実行して成功した。
初回14:59 JSTのレポート（SSMコマンドID `00737cad-8826-418c-8704-520f22895372`）は更新前の記録であり、更新後の公開には使わない。
更新後の停止を繰り返さないよう、承認を受けて計画メンテナンスによる更新へ変更した。
この設定は新しい配布物のインストーラーにも含めた。

### 実提出の確認記録

一時問題`4c7389bd-50a3-4ffe-8e35-f3f33e761ede`の2ケースで、以下の提出すべてがACになった。
提出の監査記録は残るが、削除済みの検証アカウントではログインできない。

| ランタイム | 提出ID |
| --- | --- |
| C++17 GCC | `ee75f8f1-71ca-4f6e-908f-70acd4d42dde` |
| C23 GCC | `4068ca48-823f-45fc-933f-a092625d49c3` |
| C23 Clang | `b3937aba-431d-4e9a-9781-122b1ec24400` |
| CPython 3.14 | `901fdcae-b368-475f-9560-13c485982448` |
| PyPy 3.11 | `410a1307-69b2-442a-8027-cf2df1b67c06` |
| Codon 0.20 | `0f8a453d-58a4-4780-8217-25ce23ea52f1` |
| Rust 2024 | `504cf087-b451-421a-8646-56c9a51fe3cb` |
| C++23 GCC | `df14159b-20d5-4fe5-b64a-48876928c3f9` |
| C++23 Clang | `3ed0ee4c-ce49-43ff-bd8a-2e69c68e47d4` |

### CI変数の追従

ローカルの`infra/api/runtime.auto.tfvars`（Git管理外）は公開設定に同期した。
GitHub Actionsの`dev`で参照する次の変数も更新する必要がある。
現セッションにはGitHub変数の更新権限がないため、ここは未実施である。
次回デプロイ前に同期する。
今回の変更を含むCIは、公開設定の照合により古い変数による上書きを拒否する。

```ini
JUDGE_RUNTIME_DIGEST=sha256:b48f51ae6e808b2f4887a51d76ad9b90eede3a721d07d9a606e08024bc9c463e
JUDGE_ENABLED_RUNTIMES=["c23-gcc","c23-clang","python314","pypy311","codon020","rust2024","cpp23-gcc","cpp23-clang"]
```

Javaの公開保留はこのリストにも反映した。

## 2026年9月12日の即時投入と進捗対応

DBマイグレーション008、即時起動用の限定IAM権限、API、bridge、worker、webを反映した。
既存キューを再利用し、workerの台数は変更していない。
以下は初回再構築後に進捗対応を追加した環境の記録であり、現在の公開digestはこちらを使う。

| 項目 | 値 |
| --- | --- |
| runtime digest | `sha256:b48f51ae6e808b2f4887a51d76ad9b90eede3a721d07d9a606e08024bc9c463e` |
| 配布物SHA-256 | `157ed93d065abb7dc25d612c2f9ff3285480bc1d8aae27ea7016fad0eb37eac6` |
| 全言語smokeのSSMコマンドID | `392c1fab-a2ff-4871-980b-156f1d97d6e5` |
| C++17の実提出 | `2725fe15-8a1d-438a-aabe-4baea8e9a132` |
| CPython 3.14の実提出 | `d4c06667-5997-40e2-9688-c7418a3fc52a` |

17:05 JSTに全10ランタイムと共通隔離テストが成功した。
Javaを除く既存9ランタイムを再開し、定期dispatchを一時停止した状態でC++17とCPythonの実提出を行った。
どちらも4ケースのACを確認し、定期dispatchを復元した。
C++17は提出開始から0.77秒で準備中、1.32秒で採点中0/4を取得した。
CPythonは0.71秒で採点中0/4を取得した。
各ケースに意図的に1.5秒の待機を入れ、途中の完了ケース数が戻らないことを確認した。
これらは低負荷時の2提出の観測値であり、待ち時間の保証や50人参加時の負荷試験結果ではない。

一時問題`91ee31b5-427a-42a9-91ae-f924a5518363`とメール送信なしの検証アカウントを削除した。
プロフィールと提出の監査記録は残る。
Pythonの18テスト、PostgreSQLを使うGoテスト、TerraformのAPI 7件とjudge 5件、webの型検査、Lambdaテスト、提出画面のブラウザーテスト5件が通過した。
ブラウザーテストでは待機中と準備中のWJ、スピナー、採点中の0/4と2/4、フォーカス時の「ジャッジ中」、完了後の再取得停止を確認した。

### C++17の公開終了

同日の追加依頼により、C++17を公開設定から外した。
UIの選択肢に表示せず、APIへの`cpp17`、`cpp17-isolate`、`cpp17-local`の新規提出も拒否する。
公開言語はJavaとC++17を除く8ランタイムとし、runtime digestは変更しない。
過去の提出結果、受理済みのジョブを処理するbridge、workerのC++17と共通隔離smokeは残す。
GitHubの`dev`環境にある`JUDGE_ENABLED_RUNTIMES`も上記の8言語に更新する。
