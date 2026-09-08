# judge

Go APIとAWS上のジャッジ基盤を開発するリポジトリ。

## 開発環境

ルートの`flake.nix`と`flake.lock`で、APIとinfraに共通する開発ツールを管理する。
Go、gopls、gofumpt、golangci-lint、AWS CLI、Terraform、zipを利用できる。

リポジトリのルートで開発シェルを起動する。

```console
nix develop 'path:.'
```

direnvとnix-direnvを設定済みの場合は、初回にルートで許可する。
以後は`api/`や`infra/bootstrap/`への移動でも同じ環境を使う。

```console
direnv allow
```

Terraformのバージョンとbootstrapの構成を確認する例：

```console
terraform version
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan
```

## AWSプロファイル

ルートの`.env`で、AWS CLIとTerraformが使うプロファイルを指定する。
初回は設定例をコピーし、自分のプロファイル名に変更する。

```console
cp -n .env.example .env
```

```dotenv
AWS_PROFILE=loop0919
```

`.envrc`が[direnvの`dotenv_if_exists`](https://direnv.net/man/direnv-stdlib.1.html)で読み込むため、`.env`がなくても開発シェルは利用できる。
`.env`はGitの管理対象から除外している。
AWSの認証情報は既存のAWSプロファイルで管理する。

`.envrc`の変更後はルートで再度許可し、接続先を確認する。

```console
direnv allow
aws configure list
aws sts get-caller-identity
```

`nix develop`単体では`.env`を読み込まない。
direnvを使わない場合は、開発シェル内でルートの`.env`を読み込む。

```console
set -a
. ./.env
set +a
```

## 開発手順

- [APIの起動とテスト](api/README.md)
- [AWSインフラの作成とデプロイ](infra/README.md)
- [設計文書](docs/README.md)

AWSアカウント全体の請求アラートは、別フォルダ`~/aws-setting`で管理する。
このリポジトリのCI/CDではデプロイしない。
