# AWSインフラストラクチャ

Go APIをAmazon API Gateway HTTP APIとAWS Lambdaで公開するTerraform構成である。

```text
Client -> API Gateway HTTP API -> API Lambda -> CloudWatch Logs
```

| ディレクトリ | 管理するリソース | state |
| --- | --- | --- |
| `bootstrap/` | Terraform state用S3バケット | 初回はローカル、作成後にS3へ移行 |
| `api/` | パッケージ用S3、Lambda、HTTP API、Cognito、IAM、ログ | S3の`judge/dev/api.tfstate` |

採点処理に使うSQS、Launcher Lambda、ECS/Fargate、テストセット用S3、PostgreSQLは後続の構成として追加する。
請求アラートはAWSアカウント全体の設定として、別フォルダ`~/aws-setting`へ分離している。

## 開発環境

AWS CLI v2、Terraform 1.10以上（2.0未満）、Go、zipが必要である。
CIではTerraform 1.16.0を使い、AWS Providerは各ディレクトリの`.terraform.lock.hcl`で固定する。
リポジトリのルートにあるNix開発シェルには必要なツールが含まれる。
Terraformのライセンスを許可する設定は、このパッケージだけに限定している。

リポジトリのルートで開発シェルを起動する。

```console
nix develop 'path:.'
```

direnvを使う場合は、初回にルートで`direnv allow`を実行する。
`infra/bootstrap/`などのサブディレクトリでも同じ開発環境が適用される。

以下はリポジトリのルートで実行する。
AWSプロファイルは[ルートの`.env`](../README.md#awsプロファイル)で指定し、direnvから読み込める。
AWSの認証情報は環境変数またはAWS CLIのプロファイルで設定する。

## state保存先の初回作成

bootstrapは東京リージョンにstate用S3を作る。
バージョニング、暗号化、パブリックアクセス拒否、HTTPSの強制を設定し、古いstateを自動削除するルールは設けない。
バケットとバケットポリシーの`prevent_destroy`でTerraformによる削除を防ぐ。

```console
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=infra/bootstrap apply bootstrap.tfplan
JUDGE_STATE_BUCKET="$(terraform -chdir=infra/bootstrap output -raw state_bucket_name)"
```

作成後、bootstrap自身のstateもS3へ移す。
次の`backend.tf`はローカル設定としてGitの管理対象から除外している。

```console
cat > infra/bootstrap/backend.tf <<'HCL'
terraform {
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
HCL
terraform -chdir=infra/bootstrap init -migrate-state \
  -backend-config="bucket=$JUDGE_STATE_BUCKET" \
  -backend-config="key=judge/bootstrap.tfstate" \
  -backend-config="region=ap-northeast-1"
```

移行確認に同意してstateをコピーし、`terraform -chdir=infra/bootstrap state list`で管理対象を確認する。
別の端末でbootstrapを管理するときも同じ`backend.tf`を作り、同じバケット、key、regionを指定して`init`する。
バケット名を控え、空のローカルstateからbootstrapを再作成しない。

S3 backendの`use_lockfile`で同時更新を排除する。
実行ロールには、バケットの`s3:ListBucket`、対象stateの`s3:GetObject`と`s3:PutObject`、同じkeyに`.tflock`を付けたオブジェクトの`s3:GetObject`、`s3:PutObject`、`s3:DeleteObject`が必要になる。
詳細は[HashiCorpのS3 backend仕様](https://developer.hashicorp.com/terraform/language/backend/s3)を参照する。
state、tfvars、backend設定、保存したplanはGitに含めない。

## APIのデプロイ

Lambdaパッケージをビルドしてからplanを作る。
TerraformがzipをS3へアップロードし、そのオブジェクトのバージョンIDとSHA-256をLambdaへ設定する。
パッケージ用バケットはバージョニング、暗号化、パブリックアクセス拒否、HTTPSの強制を有効にする。
未完了のマルチパートアップロードは7日後、非現行バージョンは30日後に削除する。

```console
make -C api package
terraform -chdir=infra/api init \
  -backend-config="bucket=$JUDGE_STATE_BUCKET" \
  -backend-config="key=judge/dev/api.tfstate" \
  -backend-config="region=ap-northeast-1"
terraform -chdir=infra/api plan -out=deploy.tfplan
terraform -chdir=infra/api apply deploy.tfplan
curl "$(terraform -chdir=infra/api output -raw health_url)"
```

正常時は`{"status":"ok"}`を返す。
planの確認後はzipを再ビルドせず、そのまま保存したplanをapplyする。
パッケージのパスを変える場合は`lambda_package_path`を指定する。

API用のbackend設定例は`infra/api/backend.tfbackend.example`にある。
ファイルで管理する場合は`backend.tfbackend`へコピーし、バケット名を設定して`terraform -chdir=infra/api init -backend-config=backend.tfbackend`で読み込む。
APIのkeyは`judge/dev/api.tfstate`とし、請求アラートの`judge/billing-alerts.tfstate`とは分ける。
ディレクトリが異なっていても、同じバケットとkeyを指定すると同じstateを参照する。

誤って別の構成のstateを参照した場合は、backend設定を修正し、`terraform -chdir=infra/api init -reconfigure -backend-config=backend.tfbackend`で接続先を切り替える。
この修正では`-migrate-state`を使わない。別の構成のstateまでコピーしてしまうためである。
修正前に保存したplanは破棄し、planを作り直して削除対象がないことを確認する。

既定値は`project_name=judge`、`environment=dev`、`aws_region=ap-northeast-1`である。
LambdaはARM64、`provided.al2023`、256 MiB、タイムアウト10秒で動作する。
ログ保持期間は14日、HTTP APIのスロットリングは毎秒10リクエスト、バースト20である。
変更する場合は`infra/api/variables.tf`の入力をtfvarsまたは`TF_VAR_*`で指定する。
環境を増やすときは`environment`だけでなくbackendのkeyも分け、別の作業ディレクトリで初期化する。

APIのパッケージ用バケットとポリシーにも`prevent_destroy`を設定しているため、APIルート全体の`terraform destroy`は停止する。
削除する場合は保持対象と削除対象を確認し、バケットをTerraformの管理から外すか、保護設定を明示的に変更する。
`prevent_destroy`は構成からリソース定義を消した場合の保護にはならない。

## Cognitoによるログイン

`api/auth.tf`がメールアドレスでサインインするUser Poolと、API専用のアプリクライアントを作成する。
独自画面から`POST /auth/login`を呼び出す構成で、Cognitoのログイン画面やドメインは作成しない。
Lambdaには`COGNITO_CLIENT_ID`と`COGNITO_CLIENT_SECRET`が自動設定される。
シークレットはTerraformの出力へ公開しないが、stateと保存済みplan、Lambdaの環境変数には含まれるため、これらの読み取り権限を制限する。

初期構成では、ユーザー登録は管理者による作成に限定する。
MFA登録画面が未実装のためMFAは無効とし、必須の追加認証は仮パスワードからの変更だけにする。
パスワードは12文字以上で英大文字、英小文字、数字、記号が必要であり、仮パスワードの有効期間は7日である。
アクセストークンとIDトークンは60分、リフレッシュトークンは30日有効である。
APIのトークン更新処理は未実装のため、現時点では期限切れ後に再ログインする。

デプロイ後のUser Pool IDとクライアントIDは次のコマンドで確認できる。

```console
terraform -chdir=infra/api output -raw cognito_user_pool_id
terraform -chdir=infra/api output -raw cognito_client_id
terraform -chdir=infra/api output -raw login_url
```

AWSコンソールのCognitoから、このUser Poolへテストユーザーを作成する。
メールアドレスを設定して仮パスワードを発行し、[ログインAPI](../api/README.md#ログインapi)でログインする。
`NEW_PASSWORD_REQUIRED`が返ったら`POST /auth/challenge`へ新しいパスワードを送る。
ユーザーのパスワードはTerraformで管理しない。

User PoolにはCognitoの削除保護とTerraformの`prevent_destroy`を設定している。
サインイン属性などの変更で置換が必要になった場合は、ユーザーの移行方法を決めてから保護設定を変更する。

料金プランはパスワード認証に対応するLiteを明示する。
InfracostではUser Poolの料金が未対応であり、利用量未設定のスキャン結果にある月額0ドルは実運用の見積もりではない。
2026年9月8日時点の[AWS料金表](https://aws.amazon.com/cognito/pricing/)では、Liteの直接ログインはアカウントまたはAWS組織ごとに月1万MAUの無料枠がある。
API Gateway、Lambda、ログ、メールなどの料金と、他のUser Poolによる無料枠の消費は別途確認する。
組織のコストガードレールは月額250ドルの増加をブロックするが、今回のスキャンには比較元とCognitoの利用料金がないため、この上限への適合は未判定である。

APIルートの共通タグには`Service=judge`を追加し、`Environment`は`dev`から`Dev`へ表記を揃える。
これは組織のタグポリシーに合わせた変更で、既存リソースにもタグ更新が発生する。
環境名を`stage`または`prod`にした場合のタグは`Stage`または`Prod`になる。
リソース名やstateのkeyに使う環境名は変わらない。

## CI/CD

`.github/workflows/ci.yml`はGoのテスト、静的解析、Lambdaのビルド、Terraformの整形確認、`validate`、モックProviderによる`terraform test`を実行する。
Terraformのテストは実際のAWSリソースを作成しない。
ローカルでも同じ検証を実行できる。

```console
make -C api package
terraform fmt -check -recursive infra
for root in bootstrap api; do
  terraform -chdir="infra/$root" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="infra/$root" validate
  terraform -chdir="infra/$root" test
done
```

`.github/workflows/deploy-dev.yml`は`main`へのAPIまたはinfraの変更と手動実行を契機に、同じ検証を通してAPIをplan、applyし、ヘルスチェックする。
bootstrapのapplyは手動で行う。
同時デプロイは一つに制限し、実行中のデプロイを後続のpushで中止しない。

GitHub ActionsはOIDCでAWSのデプロイロールを引き受ける。
初回にOIDCプロバイダー（`https://token.actions.githubusercontent.com`、Audienceは`sts.amazonaws.com`）とIAMロールを作成する。
Trust policyの`sub`条件を対象リポジトリのEnvironment `dev`に限定する。
詳細は[GitHubのAWS向けOIDC設定手順](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)を参照する。
ロールにはAPIのS3、Lambda、API Gateway、Cognito User Poolとアプリクライアント、IAM、CloudWatch Logsの管理権限と、APIの実行ロールに限定した`iam:PassRole`、前述のstateとロックへの権限が必要になる。
Cognitoの作成、参照、更新、削除、タグ管理の権限が既存ロールにない場合は、デプロイ前に追加する。
Lambdaの実行ロールにはCognitoの管理権限を追加しない。

GitHubのEnvironment `dev`を作成し、次のVariablesを設定する。

| 変数 | 値 |
| --- | --- |
| `AWS_ACCOUNT_ID` | 12桁のAWSアカウントID |
| `AWS_DEPLOY_ROLE_ARN` | デプロイ用IAMロールのARN |
| `TF_STATE_BUCKET` | bootstrapが作成したstate用バケット名 |

ローカルとCIは同じアカウント、東京リージョンのstateバケット、`judge/dev/api.tfstate`を使う。
初回の自動デプロイ前にbootstrapとVariablesの設定を済ませる。
ブランチ保護の必須チェックには`CI / Test and package API`を指定する。

## dev環境の管理

既存のdev APIは、CloudFormationからリソースを保持してTerraformへ移管済みである。
API GatewayとLambdaをimportし、既存URLを維持している。
`infra/api/main.tf`のIAMロール名とLambda PermissionのStatement IDは、旧リソースの実際の値に合わせている。
別の環境を作る場合は、この2つの識別子も環境に合わせて設定する。
移管後はこのAPIをCloudFormationで再デプロイせず、API専用stateからTerraformで更新する。

## CloudFormationで作成済みの環境

この書き換えはリポジトリの構成を変更するものであり、既存のCloudFormationスタックを自動的にTerraformへ移管しない。
既存リソースがある場合は、CIの自動デプロイを停止し、以下の順序で移管する。
未デプロイの場合はこの作業は不要である。

1. 既存スタックのテンプレート、パラメータ、Outputs、物理リソースIDを保存する。
2. 移管対象に`DeletionPolicy: Retain`と`UpdateReplacePolicy: Retain`を設定してスタックを更新する。
3. 保持設定を確認してから対象をスタックから外す。全体を移管する場合はスタックを削除してもよいが、対象がすべて保持されることを事前に確認する。
4. state用bootstrapを作成し、APIのbackendを初期化する。
5. 実際の名前に合わせてTerraform構成を調整し、各リソースをimportする。自動生成されたS3名やIAMロール名は、`bucket_prefix`や`name_prefix`を実際の`bucket`や`name`に置き換えておく。
6. planを確認し、意図しない削除や再作成をなくしてからapplyとCIを再開する。

importは`terraform -chdir=infra/api import ADDRESS ID`の形式で実行する。
APIの主な対応は次のとおりである。

| 旧論理ID | Terraformアドレス | import ID |
| --- | --- | --- |
| `DeploymentArtifactBucket` | `aws_s3_bucket.artifacts` | バケット名 |
| バケットのバージョニング設定 | `aws_s3_bucket_versioning.artifacts` | バケット名 |
| バケットの暗号化設定 | `aws_s3_bucket_server_side_encryption_configuration.artifacts` | バケット名 |
| バケットの所有権設定 | `aws_s3_bucket_ownership_controls.artifacts` | バケット名 |
| バケットの公開拒否設定 | `aws_s3_bucket_public_access_block.artifacts` | バケット名 |
| バケットのライフサイクル設定 | `aws_s3_bucket_lifecycle_configuration.artifacts` | バケット名 |
| `DeploymentArtifactBucketPolicy` | `aws_s3_bucket_policy.artifacts` | バケット名 |
| `ApiLambdaLogGroup` | `aws_cloudwatch_log_group.lambda` | ロググループ名 |
| `ApiLambdaRole` | `aws_iam_role.api` | ロール名 |
| ロール内の`cloudwatch-logs`ポリシー | `aws_iam_role_policy.logs` | `ロール名:cloudwatch-logs` |
| `ApiLambda` | `aws_lambda_function.api` | 関数名 |
| `HttpApi` | `aws_apigatewayv2_api.api` | API ID |
| `ApiIntegration` | `aws_apigatewayv2_integration.api` | `API ID/Integration ID` |
| `DefaultRoute` | `aws_apigatewayv2_route.default` | `API ID/Route ID` |
| `ApiGatewayLogGroup` | `aws_cloudwatch_log_group.api_gateway` | ロググループ名 |
| `DefaultStage` | `aws_apigatewayv2_stage.default` | `API ID/$default` |
| `ApiGatewayInvokePermission` | `aws_lambda_permission.api_gateway` | `関数名/Statement ID` |

Lambda Permissionの`statement_id`も既存の値に合わせる。
`aws_s3_object.api_package`は新しい固定キーへアップロードするため、既存のハッシュ付きパッケージをimportする必要はない。

詳細は[HashiCorpのリソースimport手順](https://developer.hashicorp.com/terraform/cli/import/usage)を参照する。

## 公開範囲

現在の`$default`ルートは認証なしで公開される。
`GET /health`、`POST /auth/login`、`POST /auth/challenge`は認証前に呼び出すエンドポイントである。
業務APIを追加する際は、API GatewayのJWT AuthorizerやAPI内のトークン検証を追加する。
