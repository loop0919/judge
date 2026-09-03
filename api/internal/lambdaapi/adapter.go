// Package lambdaapiは、API Gateway HTTP APIとnet/httpの間を変換する。
package lambdaapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/aws/aws-lambda-go/events"
)

// Adapterは、API Gateway HTTP APIのペイロード形式2.0をhttp.Handlerへ渡す。
type Adapter struct {
	handler http.Handler
}

// Newは、handlerを呼び出すAdapterを返す。
func New(handler http.Handler) *Adapter {
	return &Adapter{handler: handler}
}

// ProxyWithContextは、API GatewayのリクエストをHTTPリクエストへ変換する。
func (a *Adapter) ProxyWithContext(
	ctx context.Context,
	event events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	request, err := newHTTPRequest(ctx, event)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	recorder := httptest.NewRecorder()
	a.handler.ServeHTTP(recorder, request)

	result := recorder.Result()
	defer func() {
		_ = result.Body.Close()
	}()

	body, err := io.ReadAll(result.Body)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, fmt.Errorf("read HTTP response: %w", err)
	}

	headers := make(map[string]string, len(result.Header))
	var cookies []string
	for name, values := range result.Header {
		if strings.EqualFold(name, "Set-Cookie") {
			cookies = append(cookies, values...)
			continue
		}

		headers[name] = strings.Join(values, ",")
	}

	response := events.APIGatewayV2HTTPResponse{
		StatusCode: result.StatusCode,
		Headers:    headers,
		Cookies:    cookies,
		Body:       string(body),
	}
	if !utf8.Valid(body) {
		response.Body = base64.StdEncoding.EncodeToString(body)
		response.IsBase64Encoded = true
	}

	return response, nil
}

func newHTTPRequest(
	ctx context.Context,
	event events.APIGatewayV2HTTPRequest,
) (*http.Request, error) {
	method := event.RequestContext.HTTP.Method
	if method == "" {
		return nil, fmt.Errorf("API Gateway request has no HTTP method")
	}

	path := event.RawPath
	if path == "" {
		path = event.RequestContext.HTTP.Path
	}
	if path == "" {
		path = "/"
	}

	body := []byte(event.Body)
	if event.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(event.Body)
		if err != nil {
			return nil, fmt.Errorf("decode API Gateway request body: %w", err)
		}

		body = decoded
	}

	host := headerValue(event.Headers, "host")
	if host == "" {
		host = event.RequestContext.DomainName
	}
	scheme := headerValue(event.Headers, "x-forwarded-proto")
	if scheme == "" {
		scheme = "https"
	}

	requestURI := path
	if event.RawQueryString != "" {
		requestURI += "?" + event.RawQueryString
	}
	target, err := url.ParseRequestURI(requestURI)
	if err != nil {
		return nil, fmt.Errorf("parse API Gateway request URI: %w", err)
	}
	target.Scheme = scheme
	target.Host = host

	request, err := http.NewRequestWithContext(ctx, method, target.String(), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create HTTP request: %w", err)
	}

	for name, value := range event.Headers {
		if strings.EqualFold(name, "host") {
			continue
		}

		request.Header.Set(name, value)
	}
	if len(event.Cookies) > 0 {
		request.Header.Set("Cookie", strings.Join(event.Cookies, "; "))
	}

	request.Host = host
	request.RemoteAddr = event.RequestContext.HTTP.SourceIP
	request.RequestURI = requestURI

	return request, nil
}

func headerValue(headers map[string]string, name string) string {
	for candidate, value := range headers {
		if strings.EqualFold(candidate, name) {
			return value
		}
	}

	return ""
}
