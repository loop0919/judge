# Haskell、JavaScript、TypeScript、Rubyに対応しました

2026年9月19日、ShareOJの提出言語にHaskell、JavaScript、TypeScript、Rubyを追加しました。
4言語で9つの実行環境を選べるようになり、公開中の選択肢は従来の12個から21個に増えました。

使い慣れた言語で問題を解くのはもちろん、同じコードを異なる処理系で試すこともできます。

## 追加した実行環境

| 言語 | 実行環境 |
| --- | --- |
| Haskell | GHC 9.10.3（Stackage LTS 24系列） |
| JavaScript | Node.js 24.21.0 LTS、Deno 2.9.7、Bun 1.4.2 |
| TypeScript | Node.js 24.21.0 LTS、Deno 2.9.7、Bun 1.4.2 |
| Ruby | CRuby 4.0.7、TruffleRuby Community 40.0.0 |

提出画面の「言語」から、利用したい言語と実行環境を選択できます。

## 競技向けライブラリも利用できます

各実行環境には、標準ライブラリに加えて競技プログラミングで使われるライブラリを用意しました。
提出時にパッケージをインストールする必要はありません。

- Haskellでは、`ac-library-hs`、`vector`、`massiv`、`lens`、`hmatrix`などを利用できます。
- JavaScriptとTypeScriptでは、`ac-library-js`、`data-structure-typed`、`lodash`、`mathjs`などを利用できます。
- Rubyでは、ACL、`sorted_set`、`rgl`、`z3`などを利用できます。

利用できるライブラリは処理系によって一部異なります。
たとえばOR-ToolsはCRubyで利用できますが、C拡張の互換性によりTruffleRubyでは利用できません。

## コンパイルと実行時の動作

TypeScriptは提出前に型検査を行い、型エラーをコンパイルエラー（CE）として扱います。
Node.jsとBun向けのTypeScriptは、`NodeNext`形式でJavaScriptへコンパイルしてから実行します。

JavaScriptとRubyも実行前に構文を検査します。
Haskellは固定済みのパッケージ環境でコンパイルするため、提出ごとにCabalで依存関係を取得することはありません。

すべての依存関係はあらかじめ固定しており、採点中の外部ネットワーク接続やパッケージの追加インストールには対応していません。

## 通常提出から対話問題まで対応しました

追加した9つの実行環境は、通常提出、サンプル検証、入出力生成に利用できます。
スペシャルジャッジや対話形式の問題でも、既存言語と同じ一覧から選択できます。

対話形式でRubyを使う場合は、`STDIN.gets`で入力を読み、`$stdout.sync = true`または`STDOUT.flush`で出力を送信してください。
JavaScript、TypeScript、Haskellでも、問題文の通信手順に従って必要な箇所で出力をフラッシュする必要があります。

各言語のコンパイル設定、ライブラリ一覧、実行制限は[使える言語と実行環境の仕様](/blog/language-guide)で確認できます。
