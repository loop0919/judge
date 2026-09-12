package httpapi_test

import (
	"context"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/smithy-go"
	"judge/api/internal/httpapi"
)

type refreshStub struct {
	cognitoStub
	refresh func(*cognitoidentityprovider.GetTokensFromRefreshTokenInput) (*cognitoidentityprovider.GetTokensFromRefreshTokenOutput, error)
}

func (s refreshStub) GetTokensFromRefreshToken(_ context.Context, in *cognitoidentityprovider.GetTokensFromRefreshTokenInput, _ ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GetTokensFromRefreshTokenOutput, error) {
	return s.refresh(in)
}

func TestRefreshSession(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
	}{
		{"valid", `{"refresh_token":"valid"}`, 200},
		{"expired", `{"refresh_token":"expired"}`, 401},
		{"unavailable", `{"refresh_token":"unavailable"}`, 502},
		{"missing", `{}`, 400},
		{"oversized", `{"refresh_token":"` + strings.Repeat("x", 4097) + `"}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			client := refreshStub{refresh: func(in *cognitoidentityprovider.GetTokensFromRefreshTokenInput) (*cognitoidentityprovider.GetTokensFromRefreshTokenOutput, error) {
				calls++
				if aws.ToString(in.ClientId) != "client" || aws.ToString(in.ClientSecret) != "secret" {
					t.Fatal("missing app client authentication")
				}
				switch aws.ToString(in.RefreshToken) {
				case "expired":
					return nil, &smithy.GenericAPIError{Code: "NotAuthorizedException", Message: "private-token-details"}
				case "unavailable":
					return nil, nil
				}
				return &cognitoidentityprovider.GetTokensFromRefreshTokenOutput{AuthenticationResult: &types.AuthenticationResultType{AccessToken: aws.String("new-access"), IdToken: aws.String("new-id"), ExpiresIn: 3600}}, nil
			}}
			result := authRequest(httpapi.NewHandler(httpapi.AuthConfig{Client: client, ClientID: "client", ClientSecret: "secret"}), "/auth/refresh", tc.body)
			if result.Code != tc.status {
				t.Fatalf("status %d: %s", result.Code, result.Body.String())
			}
			if result.Header().Get("Cache-Control") != "no-store" || strings.Contains(result.Body.String(), "private-token-details") {
				t.Fatal("unsafe authentication response")
			}
			if tc.status == 400 && calls != 0 {
				t.Fatal("invalid input reached Cognito")
			}
			if tc.status == 200 && !strings.Contains(result.Body.String(), `"access_token":"new-access"`) {
				t.Fatal("missing refreshed access token")
			}
		})
	}
}
