# AWSインフラストラクチャ

既存のGo APIを、Amazon API Gateway HTTP APIとAWS Lambdaで公開するCloudFormation構成である。

```text
Client -> API Gateway HTTP API -> API Lambda -> CloudWatch Logs
```

CloudFormationがスタックの状態と更新履歴をAWS上で管理する。
このディレクトリは、まずAPIの実行基盤だけを作る。
採点処理に使うSQS、Launcher Lambda、ECS/Fargate、S3、PostgreSQLは、APIとの責務と権限を分けて後続のスタックとして追加する。

## ファイル

- `bootstrap.yaml`：Lambdaデプロイパッケージを保存するS3バケット。
- `template.yaml`：API Gateway、Lambda、IAM、CloudWatch Logs。

デプロイ用S3バケットは本体より先に必要なため、独立したbootstrapスタックにしている。
バケットは暗号化、バージョニング、パブリックアクセス拒否を有効にし、bootstrapスタックを削除しても保持する。

## 前提

- AWSの認証情報を、環境変数またはAWS CLIのプロファイルで設定済みであること。
- AWS CLI v2、Go、zipを利用できること。
- 対象のAWSアカウントでCloudFormation、S3、Lambda、API Gateway、IAM、CloudWatch Logsを操作できること。

Nixを使う場合は、APIディレクトリの開発シェルに必要なコマンドが含まれる。

```console
cd api
nix develop 'path:.'
```

以下の例は東京リージョンへ`judge-dev`環境を作る。

## 1. Lambdaをビルドする

リポジトリのルートで実行する。

```console
cd api
make package
cd ..
```

## 2. デプロイ用S3バケットを作る

```console
aws cloudformation deploy \
  --region ap-northeast-1 \
  --template-file infra/bootstrap.yaml \
  --stack-name judge-dev-bootstrap \
  --parameter-overrides ProjectName=judge Environment=dev
```

作成されたバケット名を取得する。

```console
JUDGE_ARTIFACT_BUCKET="$(aws cloudformation describe-stacks \
  --region ap-northeast-1 \
  --stack-name judge-dev-bootstrap \
  --query "Stacks[0].Outputs[?OutputKey=='ArtifactBucketName'].OutputValue | [0]" \
  --output text)"
```

## 3. Lambdaパッケージをアップロードする

`package`はローカルのzipをS3へアップロードし、S3の保存先を埋め込んだテンプレートを生成する。

```console
mkdir -p infra/.build
aws cloudformation package \
  --region ap-northeast-1 \
  --template-file infra/template.yaml \
  --s3-bucket "$JUDGE_ARTIFACT_BUCKET" \
  --s3-prefix judge-dev/api \
  --output-template-file infra/.build/packaged-template.yaml
```

## 4. 変更内容を確認してデプロイする

最初にChange Setだけを作り、AWSコンソールまたはCLIで変更内容を確認する。

```console
aws cloudformation deploy \
  --region ap-northeast-1 \
  --template-file infra/.build/packaged-template.yaml \
  --stack-name judge-dev-api \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides ProjectName=judge Environment=dev \
  --no-execute-changeset
```

確認後、`--no-execute-changeset`を外して同じコマンドを実行するとデプロイされる。

## 5. APIを確認する

```console
JUDGE_HEALTH_URL="$(aws cloudformation describe-stacks \
  --region ap-northeast-1 \
  --stack-name judge-dev-api \
  --query "Stacks[0].Outputs[?OutputKey=='HealthUrl'].OutputValue | [0]" \
  --output text)"
curl "$JUDGE_HEALTH_URL"
```

正常時は`{"status":"ok"}`を返す。

## 公開範囲

現在の`$default`ルートは認証なしで公開される。
ヘルスチェック以外のAPIを追加する際は、利用者の認証方式を決め、API GatewayのJWT Authorizerなどを追加する。
