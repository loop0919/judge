package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/smithy-go"
)

type registrationClient interface {
	SignUp(context.Context, *cognitoidentityprovider.SignUpInput, ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.SignUpOutput, error)
	ConfirmSignUp(context.Context, *cognitoidentityprovider.ConfirmSignUpInput, ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.ConfirmSignUpOutput, error)
	ResendConfirmationCode(context.Context, *cognitoidentityprovider.ResendConfirmationCodeInput, ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.ResendConfirmationCodeOutput, error)
}

func (a AuthConfig) registration(w http.ResponseWriter, r *http.Request) {
	if !a.available(w) {
		return
	}
	client, ok := a.Client.(registrationClient)
	if !ok {
		authError(w, 503, "authentication_unavailable")
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password,omitempty"`
		Code     string `json:"code,omitempty"`
	}
	if !readAuthJSON(w, r, &input) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || len(email) > 128 || !strings.Contains(email, "@") {
		authError(w, 400, "invalid_request")
		return
	}
	params := map[string]string{}
	a.addSecretHash(params, email)
	var secretHash *string
	if hash := params["SECRET_HASH"]; hash != "" {
		secretHash = aws.String(hash)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	switch r.URL.Path {
	case "/auth/signup":
		if input.Code != "" || !validSignupPassword(input.Password) {
			authError(w, 400, "invalid_password")
			return
		}
		out, err := client.SignUp(ctx, &cognitoidentityprovider.SignUpInput{
			ClientId: aws.String(a.ClientID), SecretHash: secretHash, Username: aws.String(email), Password: aws.String(input.Password),
			UserAttributes: []types.AttributeType{{Name: aws.String("email"), Value: aws.String(email)}},
		})
		if err != nil {
			registrationError(w, err, "signup")
			return
		}
		if out == nil {
			authError(w, 502, "authentication_unavailable")
			return
		}
		writeAuthJSON(w, 200, map[string]bool{"confirmed": out.UserConfirmed})
	case "/auth/confirm-signup":
		code := strings.TrimSpace(input.Code)
		if input.Password != "" || code == "" || len(code) > 2048 || strings.IndexFunc(code, unicode.IsSpace) >= 0 {
			authError(w, 400, "invalid_request")
			return
		}
		out, err := client.ConfirmSignUp(ctx, &cognitoidentityprovider.ConfirmSignUpInput{
			ClientId: aws.String(a.ClientID), SecretHash: secretHash, Username: aws.String(email), ConfirmationCode: aws.String(code), ForceAliasCreation: false,
		})
		if err != nil {
			registrationError(w, err, "confirm")
			return
		}
		if out == nil {
			authError(w, 502, "authentication_unavailable")
			return
		}
		writeAuthJSON(w, 200, map[string]bool{"confirmed": true})
	case "/auth/resend-confirmation":
		if input.Password != "" || input.Code != "" {
			authError(w, 400, "invalid_request")
			return
		}
		out, err := client.ResendConfirmationCode(ctx, &cognitoidentityprovider.ResendConfirmationCodeInput{
			ClientId: aws.String(a.ClientID), SecretHash: secretHash, Username: aws.String(email),
		})
		if err != nil {
			registrationError(w, err, "resend")
			return
		}
		if out == nil {
			authError(w, 502, "authentication_unavailable")
			return
		}
		writeAuthJSON(w, 200, map[string]bool{"sent": true})
	}
}

func validSignupPassword(password string) bool {
	if utf8.RuneCountInString(password) < 12 || len(password) > 256 {
		return false
	}
	var lower, upper, number, symbol bool
	for _, c := range password {
		if unicode.IsSpace(c) {
			return false
		}
		lower = lower || (c >= 'a' && c <= 'z')
		upper = upper || (c >= 'A' && c <= 'Z')
		number = number || (c >= '0' && c <= '9')
		symbol = symbol || unicode.IsPunct(c) || unicode.IsSymbol(c)
	}
	return lower && upper && number && symbol
}

func registrationError(w http.ResponseWriter, err error, action string) {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		if action == "signup" && code == "NotAuthorizedException" {
			authError(w, 503, "registration_unavailable")
			return
		}
		// Do not expose whether an email is already registered or can receive a code.
		if action == "signup" && code == "UsernameExistsException" {
			writeAuthJSON(w, 200, map[string]bool{"confirmed": false})
			return
		}
		if action == "resend" && (code == "UserNotFoundException" || code == "NotAuthorizedException" || code == "InvalidParameterException") {
			writeAuthJSON(w, 200, map[string]bool{"sent": true})
			return
		}
		switch code {
		case "CodeMismatchException", "ExpiredCodeException", "UserNotFoundException", "NotAuthorizedException", "AliasExistsException":
			authError(w, 400, "invalid_confirmation")
			return
		case "InvalidPasswordException", "PasswordHistoryPolicyViolationException":
			authError(w, 400, "invalid_password")
			return
		case "InvalidParameterException":
			authError(w, 400, "invalid_request")
			return
		case "TooManyRequestsException", "LimitExceededException", "TooManyFailedAttemptsException":
			w.Header().Set("Retry-After", "60")
			authError(w, 429, "too_many_requests")
			return
		}
	}
	authError(w, 502, "authentication_unavailable")
}
