# Haskell、JavaScript、TypeScript、Rubyの追加

既存14ランタイムの実体を保持し、9ランタイムを追加する。
実機smokeに合格したIDだけを公開する。
配布とDB変更の完了状況は[適用記録](runtime-rollout.md)を参照する。

## 採用バージョン

| 公開ID | 実体 |
| --- | --- |
| `haskell-ghc910` | GHC 9.10.3、Stackage LTS 24.59対応コンパイラ |
| `javascript-node24` / `typescript-node24` | Node.js 24.21.0 LTS、TypeScript 7.0.2 |
| `javascript-deno29` / `typescript-deno29` | Deno 2.9.7、同梱TypeScript 6.0.3 |
| `javascript-bun14` / `typescript-bun14` | Bun 1.4.2、TypeScript 7.0.2 |
| `ruby40` | CRuby 4.0.7 |
| `ruby-truffle40` | TruffleRuby Community 40.0.0 |

Denoはユーザーが承認したGitHub公式安定版を使用する。
LTS専用配布物としては扱わない。
BunとRubyはLTSの指定がないため安定版を固定する。
HaskellはコンパイラをLTS対応版とし、ライブラリ全体をStackage snapshotそのものに固定する方式ではない。

## 依存の固定

対象一覧は[AtCoder 2025年10月一覧](https://img.atcoder.jp/file/language-update/2025-10/language-list.html)から抽出し、`judge/addition-deps/catalog.json`に保存する。
追加指示によりTorch、LightGBM、Rumaleと専用の推移的依存を除外する。
LibTorchも配布しない。

公式配布物のURLとSHA-256は`judge/runtime-addition-sources.lock.json`に固定する。
npmは`package-lock.json`、JSRは`deno.lock`、Rubyは処理系別のGemfile.lock、Haskellは`cabal.project.freeze`とビルドplanを使用する。
GHC組み込みパッケージはGHC付属版を維持する。
HaskellのHackage index-stateは2026年9月18日00:00 UTCに固定し、ソースアーカイブのSHA-256も保存する。
Denoは一覧のパッケージの全公開サブパスを事前キャッシュする。
通常ビルドで最新版を再解決しない。

Ruby 4ではfiddleが標準添付から外れているため、numo-linalgの構築依存として固定導入する。
numo-openblasは自前のOpenBLASヘッダーを優先し、ビルドホスト固有のAVX命令へ固定されないようCORE2向けに構築する。
OR-Toolsのネイティブ配布物はgem側で固定されたURLとSHA-256を使用する。
TruffleRuby 40ではOR-Toolsが必要とする`rb_frame_method_id_and_class`が未実装である。
Rice 4.12と4.11.5ではGC root登録時の異常終了、4.10では当該シンボル欠落を確認した。
ユーザー承認によりTruffleRubyだけOR-Toolsを除外し、CRubyでは0.18.0を提供する。

## コンパイルと隔離

内部IDは公開IDに`-isolate`を付ける。
API形式とDBスキーマは変更しない。
JSとRubyは構文検査し、TSは型検査して型エラーをCEにする。
Haskellは固定パッケージDBでコンパイルし、提出時にCabalを実行しない。

スクリプトの拡張子を成果物にも保持する。
Node.jsとBun向けのTSでは、コンパイル結果のJSを成果物として保存する。
コンパイラ出力の親ディレクトリとファイルのシンボリックリンクを拒否する。
`node_modules`は読み取り専用でマウントする。
Denoのキャッシュは提出ごとのboxへ複製し、共有領域への書き込みを許可しない。
Bunの自動インストールは無効にする。

CPU、メモリ、ファイル数、ネットワークと秘密ファイルの隔離は現行条件を維持する。
VMのヒープ設定は提出用とinteractor用で分ける。
未知の言語をPythonとして扱うsmokeのフォールバックは廃止する。

## ビルド

```sh
python3 judge/prepare-runtime-inputs.py --additions
docker build -f judge/runtime-additions.Dockerfile -t openoj-runtime:additions judge
docker create --name openoj-additions-export openoj-runtime:additions
docker cp openoj-additions-export:/runtime.tar.gz judge/.build/runtime-additions.tar.gz
docker rm openoj-additions-export
bash judge/build-assets.sh
```

`RESOLVE=1`は依存更新時だけ使用する。
更新後のlockをレビューして保存し、通常ビルドで検証する。
ベースアーカイブはADR 0010適用版で、SHA-256は`4e28c974185c64330731c15d9a0db1504c91b6c322dec92b28ecaa4bc69adfdc`とする。
