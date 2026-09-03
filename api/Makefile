.PHONY: package

package:
	mkdir -p .build
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags="-s -w" -o .build/bootstrap ./cmd/lambda
	cd .build && zip -q -FS api.zip bootstrap
