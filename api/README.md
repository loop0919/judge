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
nix develop .
cd api
```

開発シェルにはGo、gopls、gofumpt、golangci-lint、AWS CLI、Terraform、zipが含まれる。
以降のコマンドは`api/`ディレクトリで実行する。

## ローカル起動

API とフロントエンドをまとめて起動する場合は、リポジトリのルートで `make dev` を実行する。
準備と停止方法は[ルートの README](../README.md#開発環境)を参照する。

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
現在のカタログは固定のサンプル1件であり、非公開の下書きとは別に管理する。
下書き保存には後述の`/my/problems`を使い、提出APIは未実装である。
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
Go APIにはパスワード再設定とトークン更新は含まれない。
ブラウザー向けのCookie管理とログアウトはNuxtの`/api/auth/*`が担当する。
本番のログイン通信はHTTPSを使う。
`/auth/me`と`/my/problems`はアクセストークンの署名、有効期限、発行元、`client_id`と`token_use=access`を検証する。
Cognitoの公開鍵は設定したUser PoolのJWKSから取得し、所有者には検証済みの`sub`を使う。
既存の`GET /health`は公開エンドポイントのままである。

## サインアップAPI

Cognitoのセルフサインアップを使い、登録したメールアドレスへ確認コードを送る。
`infra/api/auth.tf`で`allow_admin_create_user_only = false`とメールのコード認証を設定している。
既存のUser PoolにもこのTerraform変更を適用する必要がある。
登録画面は`/signup`、メール確認後のログイン画面は`/login`である。

| API | JSON本文 | 成功応答 |
| --- | --- | --- |
| `POST /auth/signup` | `email`、`password` | `{"confirmed":false}`（メール確認が必要） |
| `POST /auth/confirm-signup` | `email`、`code` | `{"confirmed":true}` |
| `POST /auth/resend-confirmation` | `email` | `{"sent":true}` |

ログインと同じCognitoクライアント設定を使う。
シークレット付きクライアントには、正規化したメールアドレスから計算した`SecretHash`を送る。
AWSの管理者APIは使わず、追加のIAM権限を必要としない。
パスワードをDBへ保存せず、登録とメール確認だけではログインCookieを発行しない。
Cognitoのトリガーなどで自動確認された場合、登録応答の`confirmed`は`true`になる。

パスワードは12文字以上で英大文字、英小文字、数字、記号を含み、空白を含まないものを受け付ける。
メールアドレスは128バイト、パスワードは256バイト、確認コードは2048バイト、JSON本文は16 KiBまでとする。
CognitoでもUser Poolのパスワードポリシーを検証する。
登録時に受け付けるユーザー属性はメールアドレスだけであり、確認済みフラグや所有者IDは指定できない。

メールアドレスが登録済みの場合も、通常の未確認登録と同じ応答を返す。
再送では、存在しないユーザーや確認済みのユーザーに対しても同じ応答を返し、登録状況を公開しない。
したがって`sent: true`はメール配送の成功を保証する値ではない。
既存アカウントからメールアドレスを移す操作は行わない。

誤った確認コードと期限切れには400、試行回数制限には429を返す。
メール送信など上流サービスの失敗は502、セルフサインアップが無効の場合は503を返す。
確認コードが届かない場合や登録要求の応答を受け取れなかった場合も、画面からメールアドレスを入力して確認と再送を再開できる。

## PostgreSQLへの問題保存

`DATABASE_URL`を設定するとPostgreSQLへ非公開の問題を保存できる。
認証にはログイン用の設定に加えて`COGNITO_USER_POOL_ID`が必要になる。
接続プールはプロセスあたり最大4接続とし、API起動時にはスキーマを変更しない。
本番の接続先、TLS、ネットワークと資格情報はデプロイ環境で設定する。
今回の変更にはAWS上のDB作成やデプロイは含まれない。

`make dev`は接続先が未設定の場合に開発用DBを作成し、マイグレーションを適用する。
外部DBを指定した場合は、対象の`DATABASE_URL`を環境変数へ読み込んだうえで、`api/`から次を明示的に実行する。

```console
go run ./cmd/migrate
```

マイグレーションはトランザクション内で実行し、適用済みのバージョンを記録する。
同時実行はPostgreSQLのアドバイザリロックで直列化する。
DB接続先のURLや資格情報はエラー応答へ含めない。

| API | 動作 |
| --- | --- |
| `GET /auth/me` | 検証済みユーザーのIDを取得 |
| `GET /my/problems` | 自分の問題を更新日時の降順で50件取得 |
| `GET /my/problems/{id}` | 自分の問題の本文と更新番号を取得 |
| `PUT /my/problems/{id}` | UUID v4のIDを指定して作成または更新 |
| `DELETE /my/problems/{id}?version=1` | 指定した更新番号の問題を削除 |

すべての要求に`Authorization: Bearer <access_token>`を付ける。
所有者はリクエスト本文から受け取らず、すべてのDB取得、更新と削除を所有者で絞り込む。
他人の問題と存在しない問題は同じ404を返す。
公開問題APIから下書きを取得することはできない。

PUTの本文は次の形式とする。
新規作成には`version: 0`を、更新には直前の取得または保存応答の`version`を指定する。
空のタイトルと本文も下書きとして保存できる。

```json
{
  "version": 0,
  "draft": {
    "title": "A + B",
    "markdown": "## 問題文\nA + B を求めてください。",
    "timeLimitMs": "2000",
    "memoryLimitMb": "1024"
  }
}
```

保存と詳細取得は`id`、`version`、`updatedAt`、`draft`を返す。
古い更新番号による保存と削除は409を返し、既存の変更を上書きしない。
タイトルは120文字、本文は100,000文字、JSON本文は700 KiBまでとする。
時間制限は100〜5,000 msの100 ms刻み、メモリ制限は64〜1,024 MiBの整数を受け付ける。

一覧は`items`（`id`、`title`、`updatedAt`）と`nextCursor`を返す。
`nextCursor`が空でなければ、次の要求の`cursor`パラメーターへ渡す。
ページを取得する間にも更新は行われるため、一覧全体のスナップショットは保証しない。

未認証または無効なトークンには401、認証やDBが未設定の場合とDB処理に失敗した場合には503を返す。
非公開APIの応答には`Cache-Control: no-store`を付ける。

## 確認

```console
go test ./...
golangci-lint run
```

実DBのテストは、専用の接続先を`TEST_DATABASE_URL`へ設定して`go test -race ./...`を実行する。
テストは一意なスキーマを作成して終了時に削除し、永続化、所有者の分離、競合と一覧のページングを検証する。
`TEST_DATABASE_URL`が未設定なら実DBのテストはスキップする。

Lambda用バイナリでは、ビルド時に`CGO_ENABLED=0`と対象アーキテクチャを指定する。
