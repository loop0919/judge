# Googleログインの設定

Google → Cognito → ShareOJの順で認証します。
初回のGoogleログイン時にCognitoユーザーが作成され、そのユーザーIDで問題を保存します。
メールアドレスとパスワードによる登録・ログインも引き続き利用できます。
既存のメールアドレス登録とは別のユーザーになるため、同じメールアドレスでも保存済みの問題は自動で共有・統合されません。

## 外部サービスの設定

この機能のGoogle OAuthクライアント・Cognitoドメイン・Google連携は、まだTerraform管理に追加していません。
以下をAWSとGoogleのコンソールで設定してください。
既存のTerraformが管理しているアプリクライアントを変更するため、次回のterraform applyでOAuth設定が戻らないよう、適用前に差分を確認してください。

1. Cognitoの既存ユーザープールに、利用可能なプレフィックスでCognitoドメインを設定します。
2. Google CloudでOAuth同意画面と「ウェブアプリケーション」のOAuthクライアントを作成します。テスト公開の場合は利用者をテストユーザーに追加します。
3. Googleの承認済みリダイレクトURIを `https://<Cognitoドメイン>/oauth2/idpresponse` に設定します。
4. CognitoユーザープールのソーシャルプロバイダーにGoogleを追加します。GoogleクライアントID・シークレットを設定し、スコープを `openid email profile`、属性マッピングをGoogleの `email` → Cognitoの `email` にします。
5. 既存のアプリクライアント（`COGNITO_CLIENT_ID`）でGoogleを有効にし、認可コードグラントとスコープ `openid email` を有効にします。メール・パスワード認証の設定は保持します。
6. 同じアプリクライアントの許可するコールバックURLに `http://localhost:3000/auth/google/callback` を追加します。本番は `https://<サイトのドメイン>/auth/google/callback` を追加します。

## ローカル環境

ルートの `.env` に以下を設定して `make dev` を実行します。
秘密情報をGitにコミットしないでください。

```dotenv
NUXT_COGNITO_DOMAIN=https://<Cognitoドメイン>
NUXT_COGNITO_CLIENT_ID=<COGNITO_CLIENT_IDと同じ値>
NUXT_COGNITO_CLIENT_SECRET=<COGNITO_CLIENT_SECRETと同じ値>
```

`COGNITO_USER_POOL_ID`、`COGNITO_CLIENT_ID`、`COGNITO_CLIENT_SECRET`、`AWS_REGION` も従来どおり必要です。
シークレットなしのクライアントでは両シークレットを空欄にします。
`make dev` のポートは `WEB_PORT` で変更でき、CognitoのコールバックURLも同じポートに変更する必要があります。
本番やWeb単独起動では `NUXT_PUBLIC_SITE_URL` とCognitoのコールバックURLのホスト・ポートを一致させてください。
設定後、ログイン画面と登録画面にGoogleボタンが表示されます。
本番では上記の `NUXT_` 変数をWebの実行環境にも設定してください。

認可コードはサーバーで交換し、PKCEと10分のHttpOnly Cookieでリクエストを検証します。
CognitoアクセストークンをGo APIで検証してから既存のログインCookieを発行します。
トークン・クライアントシークレットをブラウザーのJavaScriptには返しません。

参考: [AWSのGoogle連携手順](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp.html)、[認可エンドポイント](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)。

Googleで初回ログインしたユーザーは `/onboarding` に進み、ShareOJ用のユーザーIDを登録する。
Googleの名前・メールアドレスからユーザーIDを自動生成せず、ユーザー本人が決める。
登録済みユーザーは `/my` に進む。
