# API

Goで実装するAPIと非同期Lambdaのためのモジュールである。

## 開発環境

初回だけ、このディレクトリでdirenvを許可する。

```console
direnv allow
```

direnvを使わない場合は、Nixから開発シェルを起動する。

```console
nix develop 'path:.'
```

開発シェルにはGo、gopls、gofumpt、golangci-lintが含まれる。

## 確認

```console
go test ./...
golangci-lint run
```

Lambda用バイナリでは、ビルド時に`CGO_ENABLED=0`と対象アーキテクチャを指定する。
