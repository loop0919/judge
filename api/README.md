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

## 確認

```console
go test ./...
golangci-lint run
```

Lambda用バイナリでは、ビルド時に`CGO_ENABLED=0`と対象アーキテクチャを指定する。
