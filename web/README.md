# フロントエンド

Nuxt 4 と TypeScript で公開問題を表示する。
問題詳細は Go API から取得し、Nuxt サーバーで HTML を生成する（SSR）。

## ローカル起動

Node.js 22.19 以上の 22 系と Go が必要になる。
リポジトリのルートで `nix develop 'path:.'` を実行すると、共通の開発環境に入れる。

まず、ターミナルで API を起動する。

```console
cd api
go run ./cmd/api
```

別のターミナルで同じ開発環境に入り、フロントエンドを起動する。

```console
cd web
npm ci
cp -n .env.example .env
npm run dev
```

`http://localhost:3000/problems/a-plus-b` でサンプル問題を表示できる。
公開問題の閲覧に認証や AWS の認証情報は不要である。

| 環境変数 | 用途 | 既定値 |
| --- | --- | --- |
| `NUXT_API_BASE_URL` | Nuxt サーバーから接続する Go API | `http://127.0.0.1:8080` |
| `NUXT_PUBLIC_SITE_URL` | canonical と OGP に使う公開オリジン | `http://localhost:3000` |

API の接続先はサーバー専用の設定であり、ブラウザーには渡さない。
公開 URL は信頼できる設定値から生成し、リクエストの Host ヘッダーを使わない。

## SSR とエラー応答

`/problems/:id` は `useFetch` で Nuxt の `/api/problems/:id` を呼び出す。
Nuxt のサーバールートは Go の `/problems/:id` を取得し、応答の形式を検証する。
初回 HTML に問題文、制約、入出力例、ページ固有のタイトルと説明を含める。
取得済みデータは Nuxt のペイロードを通してブラウザーへ引き継ぐ。

存在しない問題には 404、API の接続失敗や不正な応答には 502 を返す。
エラーページには `noindex, nofollow` を付け、上流サービスの診断情報を表示しない。
本文の通常の文字列は Vue のテキスト展開で描画し、数式部分だけを KaTeX が生成した HTML と MathML で表示する。
API から受け取った HTML を直接挿入しない。

## 数式の記法

問題文、制約、入力形式、出力の説明、入出力例の解説では、`$...$` で文中数式、`$$...$$` で独立した数式を記述できる。

```text
整数 $A$ と $B$ の和を求めてください。
$0 \le A \le 10^9$
$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$
```

ドル記号をそのまま表示する場合は `\$` と書く。
JSON の文字列内ではバックスラッシュを `\\` とエスケープする。
入力形式は `$A \quad B$` のように記述し、複数行の形式では行ごとに数式を記述する。
数式の外側の改行はそのまま表示する。
入出力例のコード部分は数式に変換せず、元の文字列を表示する。
タイトルと SEO の説明文も通常のテキストとして扱う。

KaTeX の `renderToString` を SSR とブラウザーの両方で使用する。
CSS とフォントはアプリに同梱し、外部 CDN を必要としない。
未対応の命令、閉じ忘れた区切り、不正な数式は元の文字列を表示する。
`trust: false` で数式からのリンクや画像の挿入を無効にし、マクロの展開回数と数式の大きさに上限を設ける。

## ビルドとテスト

以下は `web/` で実行する。

```console
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Linux でブラウザーの共有ライブラリが不足する場合は `npx playwright install --with-deps chromium` を使う。
テストは Go API とビルド済み Nuxt を自動起動し、HTML 本文、SEO メタデータ、404 と 502、JavaScript 無効時の閲覧、画面遷移、画面幅 320 / 375 / 414 / 768 / 1280 px での表示を検証する。
テスト用にポート 13000、13001、18080、18081 を使用する。

手動では、開発サーバー起動後に HTML を確認できる。

```console
curl -i http://localhost:3000/problems/a-plus-b
curl -i http://localhost:3000/problems/missing
```

## 本番起動

SSR には Nuxt サーバーを実行する環境が必要になる。
`npm run build` 後、接続先と公開 URL を指定して起動する。

```console
NUXT_API_BASE_URL=https://api.example.com \
NUXT_PUBLIC_SITE_URL=https://judge.example.com \
node .output/server/index.mjs
```

ビルド済みサーバーは `.env` を自動では読み込まないため、実行環境で変数を設定する。
今回の実装にはホスティング、デプロイ、問題の永続化、ログイン画面、提出、採点の接続は含まれない。
Go API のカタログには固定のサンプル問題を 1 件置いている。

## 参照

- [Nuxt のデータ取得](https://nuxt.com/docs/4.x/getting-started/data-fetching)
- [Nuxt の SEO とメタデータ](https://nuxt.com/docs/4.x/getting-started/seo-meta)
