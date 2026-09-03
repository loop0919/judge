// Package mainは、API Gatewayから呼び出されるLambda関数を提供する。
package main

import (
	"github.com/aws/aws-lambda-go/lambda"

	"judge/api/internal/httpapi"
	"judge/api/internal/lambdaapi"
)

func main() {
	adapter := lambdaapi.New(httpapi.NewHandler())
	lambda.Start(adapter.ProxyWithContext)
}
