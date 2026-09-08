// Package mainは、API Gatewayから呼び出されるLambda関数を提供する。
package main

import (
	"log"
	"os"

	"github.com/aws/aws-lambda-go/lambda"

	"judge/api/internal/httpapi"
	"judge/api/internal/lambdaapi"
)

func main() {
	handler, err := httpapi.NewConfiguredHandler(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
	adapter := lambdaapi.New(handler)
	lambda.Start(adapter.ProxyWithContext)
}
