# API

Goで実装するAPIと非同期Lambdaのためのモジュールである。

## 開発環境

APIとinfraは、リポジトリのルートにあるNix開発シェルを共用する。
初回はルートでdirenvを許可する。
以下は、この`api/`ディレクトリから実行する。

```console
cd ..
direnv allow
cd api
```

direnvを使わない場合は、ルートで開発シェルを起動してからAPIへ移動する。

```console
cd ..
nix develop 'path:.'
cd api
```

開発シェルにはGo、gopls、gofumpt、golangci-lint、AWS CLI、Terraform、zipが含まれる。
以降のコマンドは`api/`ディレクトリで実行する。

## ローカル起動

開発シェルでAPIを起動する。

```console
go run ./cmd/api
```

既定では`http://localhost:8080`で待ち受ける。
ポートを変更する場合は`PORT`を指定する。

```console
PORT=3000 go run ./cmd/api
```

別のターミナルからヘルスチェックを呼び出し、起動を確認できる。

```console
curl -i http://localhost:8080/health
```

正常時は`200 OK`と次のJSONを返す。

```json
{"status":"ok"}
```

## 公開問題API

`GET /problems/a-plus-b` はサンプル問題の本文、制約、入出力例、実行時間制限とメモリ制限をJSONで返す。
認証は不要であり、未登録のIDは `404` と `{"error":"problem_not_found"}` を返す。
現在のカタログは固定のサンプル1件であり、問題の保存や提出のAPIは含まれない。
採点用の非公開テストケースはこの応答に含めない。

```console
curl -i http://localhost:8080/problems/a-plus-b
```

Nuxtからの取得とSSRの確認方法は[フロントエンドの手順](../web/README.md)を参照する。

## ログインAPI

独自のログイン画面からCognito User Poolを使って認証する。
APIはパスワードを保存せず、Cognitoの`InitiateAuth`へ渡す。
接続には`AWS_REGION`と`COGNITO_CLIENT_ID`を指定する。
シークレット付きのアプリクライアントでは`COGNITO_CLIENT_SECRET`も指定する。
シークレットはサーバーだけに設定し、ブラウザーへ渡さない。

```console
AWS_REGION=ap-northeast-1 COGNITO_CLIENT_ID=your-client-id go run ./cmd/api
```

Cognito側には以下の設定が必要である。
`infra/api/auth.tf`がUser Poolとシークレット付きアプリクライアントを作成し、Lambdaの環境変数へ接続情報を渡す。
Terraformを適用した環境では、これらを手動で設定する必要はない。
既存のUser Poolへローカルから接続する場合は、以下の設定を確認する。

- メールアドレスでログインする場合は、User Poolのサインイン属性にメールアドレスを指定する。
- アプリクライアントで`ALLOW_USER_PASSWORD_AUTH`を有効にする。
- `PreventUserExistenceErrors`を`ENABLED`にする。
- 動作確認用のユーザーを作成する。仮パスワードの場合は追加認証で本パスワードを設定する。
- Lambdaにも`COGNITO_CLIENT_ID`と、必要なら`COGNITO_CLIENT_SECRET`を設定する。`AWS_REGION`はLambdaが設定する。

`InitiateAuth`と`RespondToAuthChallenge`はIAM認証を使わないため、この処理用のIAM権限やローカルのAWS認証情報は不要である。
詳細は[AWSのInitiateAuth仕様](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html)を参照する。

### メールアドレスとパスワードによるログイン

`POST /auth/login`へJSONを送る。
`username`にはUser Poolで許可したサインイン属性（メールアドレスなど）を指定する。

```http
POST /auth/login
Content-Type: application/json

{"username":"user@example.com","password":"your-password"}
```

認証が完了すると`200 OK`でトークンを返す。
`expires_in`はアクセストークンの有効期間を秒で表す。

```json
{
  "access_token": "...",
  "id_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

初回パスワード変更やMFAが必要な場合も`200 OK`だが、トークンの代わりに`challenge_name`と`session`を返す。
画面側は`challenge_name`があれば追加認証画面を表示し、ログイン完了として扱わない。

```json
{
  "challenge_name": "NEW_PASSWORD_REQUIRED",
  "challenge_parameters": {},
  "session": "..."
}
```

### 追加認証

`POST /auth/challenge`へ直前の応答の`session`と入力値を送る。
`challenge_parameters.USER_ID_FOR_SRP`が返された場合は、その値を`username`に使う。
それ以外はログイン時の`username`を使う。

```http
POST /auth/challenge
Content-Type: application/json

{
  "username": "user@example.com",
  "challenge_name": "NEW_PASSWORD_REQUIRED",
  "session": "...",
  "responses": {"NEW_PASSWORD": "your-new-password"}
}
```

| challenge_name | responsesに指定するキー |
| --- | --- |
| `NEW_PASSWORD_REQUIRED` | `NEW_PASSWORD`。必須属性があれば`userAttributes.email`なども指定する |
| `SMS_MFA` | `SMS_MFA_CODE` |
| `SOFTWARE_TOKEN_MFA` | `SOFTWARE_TOKEN_MFA_CODE` |
| `EMAIL_OTP` | `EMAIL_OTP_CODE` |

追加認証の応答形式はログインと同じである。
別の追加認証が返った場合は、新しい`session`で続ける。
上記以外のチャレンジには未対応であり、MFAの新規登録や認証方式の選択が必要なUser Poolでは、その処理を別途実装する必要がある。

### エラーと対象範囲

エラーは`{"error":"invalid_credentials"}`の形式で返す。
AWSの内部エラーメッセージやパスワードは応答やログへ出力しない。
認証応答には`Cache-Control: no-store`を付ける。

| HTTPステータス | 意味 |
| --- | --- |
| `400` | 入力不正、パスワードポリシー違反、未対応のチャレンジ |
| `401` | 認証失敗、確認コード不正または期限切れ |
| `413` | リクエスト本文が16 KiBを超えている |
| `415` | Content-Typeがapplication/jsonではない |
| `429` | Cognitoの試行回数制限。時間を空けて再試行する |
| `502` | Cognitoとの通信失敗や想定外の応答 |
| `503` | Cognitoの接続設定がない |

ユーザー未登録、パスワード不一致、登録未確認、パスワードリセット必須は同じ`invalid_credentials`を返す。
このAPIにはユーザー登録、パスワード再設定、トークン更新、ログアウト、Cookieによるセッション管理は含まれない。
本番のログイン通信はHTTPSを使う。
トークンを使って業務APIを保護する際は、アクセストークンの署名、有効期限、発行元、クライアント、`token_use`と必要な権限を検証する処理を追加する。
既存の`GET /health`は公開エンドポイントのままである。

## 確認

```console
go test ./...
golangci-lint run
```

Lambda用バイナリでは、ビルド時に`CGO_ENABLED=0`と対象アーキテクチャを指定する。
