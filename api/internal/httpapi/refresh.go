package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
)

type refreshClient interface {
	GetTokensFromRefreshToken(context.Context, *cognitoidentityprovider.GetTokensFromRefreshTokenInput, ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GetTokensFromRefreshTokenOutput, error)
}

func (a AuthConfig) refresh(w http.ResponseWriter, r *http.Request) {
	if !a.available(w) {
		return
	}
	client, ok := a.Client.(refreshClient)
	if !ok {
		authError(w, http.StatusServiceUnavailable, "authentication_unavailable")
		return
	}
	var input struct {
		RefreshToken string `json:"refresh_token"`
	}
	if !readAuthJSON(w, r, &input) {
		return
	}
	if input.RefreshToken == "" || len(input.RefreshToken) > 4096 {
		authError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	request := &cognitoidentityprovider.GetTokensFromRefreshTokenInput{ClientId: aws.String(a.ClientID), RefreshToken: aws.String(input.RefreshToken)}
	if a.ClientSecret != "" {
		request.ClientSecret = aws.String(a.ClientSecret)
	}
	out, err := client.GetTokensFromRefreshToken(ctx, request)
	if err != nil {
		writeCognitoError(w, err)
		return
	}
	if out == nil {
		authError(w, http.StatusBadGateway, "authentication_unavailable")
		return
	}
	writeAuthResult(w, out.AuthenticationResult, "", nil, nil)
}
