.PHONY: package

package:
	mkdir -p .build
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags="-s -w" -o .build/bootstrap ./cmd/lambda
	cd .build && zip -q -FS api.zip bootstrap
	mkdir -p .build/migrate
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags="-s -w" -o .build/migrate/bootstrap ./cmd/migrate-lambda
	cd .build/migrate && zip -q -FS ../migrate.zip bootstrap

.PHONY: package-judge
package-judge:
	mkdir -p .build
	python3 -m zipfile -c .build/judge-notify.zip ../judge/notify.py
	mkdir -p .build/judge-bridge
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags="-s -w" -o .build/judge-bridge/bootstrap ./cmd/judge-bridge
	cd .build/judge-bridge && zip -q -FS ../judge-bridge.zip bootstrap
