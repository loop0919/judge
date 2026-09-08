package httpapi_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/smithy-go"

	"github.com/aws/aws-lambda-go/events"
	"judge/api/internal/httpapi"
	"judge/api/internal/lambdaapi"
)

type cognitoStub struct {
	login     func(*cognitoidentityprovider.InitiateAuthInput) (*cognitoidentityprovider.InitiateAuthOutput, error)
	challenge func(*cognitoidentityprovider.RespondToAuthChallengeInput) (*cognitoidentityprovider.RespondToAuthChallengeOutput, error)
}

func (s cognitoStub) InitiateAuth(_ context.Context, in *cognitoidentityprovider.InitiateAuthInput, _ ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error) {
	return s.login(in)
}

func (s cognitoStub) RespondToAuthChallenge(_ context.Context, in *cognitoidentityprovider.RespondToAuthChallengeInput, _ ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.RespondToAuthChallengeOutput, error) {
	return s.challenge(in)
}

func authRequest(handler http.Handler, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestLoginReturnsTokens(t *testing.T) {
	t.Parallel()
	client := cognitoStub{login: func(in *cognitoidentityprovider.InitiateAuthInput) (*cognitoidentityprovider.InitiateAuthOutput, error) {
		if in.AuthFlow != types.AuthFlowTypeUserPasswordAuth || aws.ToString(in.ClientId) != "client" || in.AuthParameters["USERNAME"] != "user@example.com" || in.AuthParameters["PASSWORD"] != " password " {
			t.Fatalf("unexpected login input")
		}
		if in.AuthParameters["SECRET_HASH"] != "4zqhOFl0JivfkWh1VINyOJyrDTdsinJktzPUT+t0plg=" {
			t.Errorf("unexpected secret hash: %s", in.AuthParameters["SECRET_HASH"])
		}
		return &cognitoidentityprovider.InitiateAuthOutput{AuthenticationResult: &types.AuthenticationResultType{
			AccessToken: aws.String("access"), IdToken: aws.String("id"), RefreshToken: aws.String("refresh"), TokenType: aws.String("Bearer"), ExpiresIn: 3600,
		}}, nil
	}}
	w := authRequest(httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client", ClientSecret: "secret"}), "/auth/login", `{"username":"user@example.com","password":" password "}`)
	if w.Code != 200 || w.Body.String() != "{\"access_token\":\"access\",\"id_token\":\"id\",\"refresh_token\":\"refresh\",\"token_type\":\"Bearer\",\"expires_in\":3600}\n" {
		t.Fatalf("response = %d %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Error("tokens must not be cached")
	}
}

func TestLoginErrors(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		code   string
		status int
		body   string
	}{
		{"NotAuthorizedException", 401, "invalid_credentials"},
		{"UserNotFoundException", 401, "invalid_credentials"},
		{"UserNotConfirmedException", 401, "invalid_credentials"},
		{"PasswordResetRequiredException", 401, "invalid_credentials"},
		{"TooManyRequestsException", 429, "too_many_requests"},
		{"InternalErrorException", 502, "authentication_unavailable"},
		{"CodeMismatchException", 401, "invalid_challenge"},
		{"ExpiredCodeException", 401, "invalid_challenge"},
		{"InvalidPasswordException", 400, "invalid_password"},
	} {
		t.Run(tc.code, func(t *testing.T) {
			t.Parallel()
			client := cognitoStub{login: func(*cognitoidentityprovider.InitiateAuthInput) (*cognitoidentityprovider.InitiateAuthOutput, error) {
				return nil, &smithy.GenericAPIError{Code: tc.code, Message: "private upstream details"}
			}}
			w := authRequest(httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client"}), "/auth/login", `{"username":"user","password":"password"}`)
			if w.Code != tc.status || w.Body.String() != "{\"error\":\""+tc.body+"\"}\n" {
				t.Fatalf("response = %d %s", w.Code, w.Body.String())
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Error("error must not be cached")
			}
		})
	}
}

func TestLoginRejectsInvalidRequestsBeforeCognito(t *testing.T) {
	t.Parallel()
	client := cognitoStub{login: func(*cognitoidentityprovider.InitiateAuthInput) (*cognitoidentityprovider.InitiateAuthOutput, error) {
		t.Fatal("must not call Cognito")
		return nil, nil
	}}
	handler := httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client"})
	for _, body := range []string{`{`, `null`, `{}`, `{"username":" ","password":"password"}`, `{"username":"user","password":""}`, `{"username":"user","password":"password","admin":true}`, `{"username":"user","password":"password"} {}`, `{"username":1,"password":"password"}`} {
		w := authRequest(handler, "/auth/login", body)
		if w.Code != 400 {
			t.Errorf("body %s: status = %d", body, w.Code)
		}
	}
	w := authRequest(handler, "/auth/login", `{"username":"user","password":"`+strings.Repeat("a", 20<<10)+`"}`)
	if w.Code != 413 {
		t.Errorf("large request status = %d", w.Code)
	}
	r := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{}`))
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 415 {
		t.Errorf("missing content type status = %d", w.Code)
	}
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/auth/login", nil))
	if w.Code != 405 {
		t.Errorf("GET status = %d", w.Code)
	}
}

func TestLoginChallengeAndCompletion(t *testing.T) {
	t.Parallel()
	client := cognitoStub{
		login: func(*cognitoidentityprovider.InitiateAuthInput) (*cognitoidentityprovider.InitiateAuthOutput, error) {
			return &cognitoidentityprovider.InitiateAuthOutput{ChallengeName: types.ChallengeNameTypeNewPasswordRequired, Session: aws.String("session"), ChallengeParameters: map[string]string{"USER_ID_FOR_SRP": "canonical-user"}}, nil
		},
		challenge: func(in *cognitoidentityprovider.RespondToAuthChallengeInput) (*cognitoidentityprovider.RespondToAuthChallengeOutput, error) {
			if aws.ToString(in.Session) != "session" || aws.ToString(in.ClientId) != "client" || in.ChallengeName != types.ChallengeNameTypeNewPasswordRequired || in.ChallengeResponses["USERNAME"] != "canonical-user" || in.ChallengeResponses["NEW_PASSWORD"] != "new-password" {
				t.Fatal("unexpected challenge input")
			}
			return &cognitoidentityprovider.RespondToAuthChallengeOutput{AuthenticationResult: &types.AuthenticationResultType{AccessToken: aws.String("access"), IdToken: aws.String("id"), ExpiresIn: 3600, TokenType: aws.String("Bearer")}}, nil
		},
	}
	handler := httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client"})
	w := authRequest(handler, "/auth/login", `{"username":"user","password":"temporary"}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"challenge_name":"NEW_PASSWORD_REQUIRED"`) || strings.Contains(w.Body.String(), "access_token") {
		t.Fatalf("challenge response = %d %s", w.Code, w.Body.String())
	}
	w = authRequest(handler, "/auth/challenge", `{"username":"canonical-user","challenge_name":"NEW_PASSWORD_REQUIRED","session":"session","responses":{"NEW_PASSWORD":"new-password"}}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"access_token":"access"`) {
		t.Fatalf("completion = %d %s", w.Code, w.Body.String())
	}
}

func TestChallengeValidation(t *testing.T) {
	t.Parallel()
	handler := httpapi.NewHandler(httpapi.AuthConfig{Client: cognitoStub{}, ClientID: "client"})
	for _, body := range []string{
		`{}`,
		`{"username":"user","session":"session","challenge_name":"CUSTOM_CHALLENGE","responses":{"ANSWER":"x"}}`,
		`{"username":"user","session":"session","challenge_name":"SMS_MFA","responses":{}}`,
		`{"username":"user","session":"session","challenge_name":"SMS_MFA","responses":{"SMS_MFA_CODE":"123456","USERNAME":"other"}}`,
	} {
		if w := authRequest(handler, "/auth/challenge", body); w.Code != 400 {
			t.Errorf("status = %d", w.Code)
		}
	}
}

func TestAuthUnconfiguredAndUpstreamUnavailable(t *testing.T) {
	t.Parallel()
	for _, path := range []string{"/auth/login", "/auth/challenge"} {
		w := authRequest(httpapi.NewHandler(), path, `{}`)
		if w.Code != 503 {
			t.Errorf("unconfigured status = %d", w.Code)
		}
	}
	for _, err := range []error{nil, errors.New("private network failure")} {
		client := cognitoStub{login: func(*cognitoidentityprovider.InitiateAuthInput) (*cognitoidentityprovider.InitiateAuthOutput, error) {
			return nil, err
		}}
		w := authRequest(httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client"}), "/auth/login", `{"username":"user","password":"password"}`)
		if w.Code != 502 || strings.Contains(w.Body.String(), "private") {
			t.Fatalf("upstream response = %d %s", w.Code, w.Body.String())
		}
	}
}

func TestAuthConfiguration(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		env       map[string]string
		wantError bool
	}{
		{map[string]string{}, false},
		{map[string]string{"COGNITO_CLIENT_ID": "client"}, true},
		{map[string]string{"COGNITO_CLIENT_SECRET": "secret"}, true},
		{map[string]string{"COGNITO_CLIENT_ID": "client", "AWS_REGION": "ap-northeast-1"}, false},
		{map[string]string{"COGNITO_CLIENT_ID": "client", "AWS_DEFAULT_REGION": "ap-northeast-1"}, false},
	} {
		_, err := httpapi.NewConfiguredHandler(func(key string) string { return tc.env[key] })
		if (err != nil) != tc.wantError {
			t.Errorf("configuration error = %v, want error %v", err, tc.wantError)
		}
	}
}

func TestMFAChallengeThroughLambda(t *testing.T) {
	t.Parallel()
	for name, key := range map[string]string{"SMS_MFA": "SMS_MFA_CODE", "SOFTWARE_TOKEN_MFA": "SOFTWARE_TOKEN_MFA_CODE", "EMAIL_OTP": "EMAIL_OTP_CODE"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			client := cognitoStub{challenge: func(in *cognitoidentityprovider.RespondToAuthChallengeInput) (*cognitoidentityprovider.RespondToAuthChallengeOutput, error) {
				if string(in.ChallengeName) != name || in.ChallengeResponses[key] != "123456" || in.ChallengeResponses["USERNAME"] != "user" {
					t.Fatal("unexpected MFA input")
				}
				return &cognitoidentityprovider.RespondToAuthChallengeOutput{AuthenticationResult: &types.AuthenticationResultType{AccessToken: aws.String("access"), IdToken: aws.String("id"), ExpiresIn: 3600}}, nil
			}}
			adapter := lambdaapi.New(httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client"}))
			response, err := adapter.ProxyWithContext(context.Background(), events.APIGatewayV2HTTPRequest{
				RawPath: "/auth/challenge", Headers: map[string]string{"content-type": "application/json"},
				Body:           `{"username":"user","session":"session","challenge_name":"` + name + `","responses":{"` + key + `":"123456"}}`,
				RequestContext: events.APIGatewayV2HTTPRequestContext{HTTP: events.APIGatewayV2HTTPRequestContextHTTPDescription{Method: "POST"}},
			})
			if err != nil || response.StatusCode != 200 || response.Headers["Cache-Control"] != "no-store" || !strings.Contains(response.Body, `"access_token":"access"`) {
				t.Fatalf("Lambda response = %+v, error = %v", response, err)
			}
		})
	}
}

type cognitoTransport func(*http.Request) (*http.Response, error)

func (f cognitoTransport) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestCognitoSDKWithoutAWSCredentials(t *testing.T) {
	t.Parallel()
	client := cognitoidentityprovider.New(cognitoidentityprovider.Options{
		Region: "ap-northeast-1", RetryMaxAttempts: 1,
		HTTPClient: cognitoTransport(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host != "cognito-idp.ap-northeast-1.amazonaws.com" || r.Header.Get("X-Amz-Target") != "AWSCognitoIdentityProviderService.InitiateAuth" {
				t.Fatal("unexpected Cognito request")
			}
			if r.Header.Get("Authorization") != "" {
				t.Error("InitiateAuth must not require IAM credentials")
			}
			if _, ok := r.Context().Deadline(); !ok {
				t.Error("request must have a deadline")
			}
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/x-amz-json-1.1"}}, Body: io.NopCloser(strings.NewReader(`{"AuthenticationResult":{"AccessToken":"access","IdToken":"id","TokenType":"Bearer","ExpiresIn":3600}}`))}, nil
		}),
	})
	w := authRequest(httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client"}), "/auth/login", `{"username":"user","password":"password"}`)
	if w.Code != 200 {
		t.Fatalf("SDK response = %d %s", w.Code, w.Body.String())
	}
}
