package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"regexp"
	"strings"
	"time"

	"judge/api/internal/database"

	"judge/api/internal/posts"
	"judge/api/internal/problems"
	"judge/api/internal/profiles"
	"judge/api/internal/submissions"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/aws/smithy-go"
)

// CognitoClientはログインで使用するCognitoの操作を表す。
type CognitoClient interface {
	InitiateAuth(context.Context, *cognitoidentityprovider.InitiateAuthInput, ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error)
	RespondToAuthChallenge(context.Context, *cognitoidentityprovider.RespondToAuthChallengeInput, ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.RespondToAuthChallengeOutput, error)
}

// AuthConfigはサーバー側のCognitoアプリクライアント設定を保持する。
type AuthConfig struct {
	Client       CognitoClient
	ClientID     string
	ClientSecret string
}

// NewConfiguredHandlerは環境変数から認証設定を読み込む。
// 未設定の場合も起動できるが、認証エンドポイントは503を返す。
func NewConfiguredHandler(getenv func(string) string) (http.Handler, error) {
	id, secret := getenv("COGNITO_CLIENT_ID"), getenv("COGNITO_CLIENT_SECRET")
	if id == "" {
		if secret != "" {
			return nil, fmt.Errorf("COGNITO_CLIENT_ID is required with COGNITO_CLIENT_SECRET")
		}
		return configuredStorage(getenv, AuthConfig{}, "")
	}
	region := getenv("AWS_REGION")
	if region == "" {
		region = getenv("AWS_DEFAULT_REGION")
	}
	if region == "" {
		return nil, fmt.Errorf("AWS_REGION is required with COGNITO_CLIENT_ID")
	}
	client := cognitoidentityprovider.New(cognitoidentityprovider.Options{
		Region:           region,
		HTTPClient:       &http.Client{Timeout: 5 * time.Second},
		RetryMaxAttempts: 1,
	})
	return configuredStorage(getenv, AuthConfig{Client: client, ClientID: id, ClientSecret: secret}, region)
}

type configuredHandler struct {
	http.Handler
	store *problems.Store
}

func (h *configuredHandler) Close() error {
	if h.store != nil {
		h.store.Close()
	}
	return nil
}

func configuredStorage(getenv func(string) string, auth AuthConfig, region string) (http.Handler, error) {
	private := PrivateProblems{Operators: make(map[string]bool)}
	for _, subject := range strings.Split(getenv("OPERATOR_SUBJECTS"), ",") {
		if subject = strings.TrimSpace(subject); subject != "" {
			private.Operators[subject] = true
		}
	}
	poolID := getenv("COGNITO_USER_POOL_ID")
	if auth.ClientID != "" && poolID != "" {
		if !regexp.MustCompile(`^[a-z0-9-]+_[A-Za-z0-9]+$`).MatchString(poolID) || !strings.HasPrefix(poolID, region+"_") {
			return nil, errors.New("invalid COGNITO_USER_POOL_ID")
		}
		private.Verifier = newCognitoVerifier("https://cognito-idp."+region+".amazonaws.com/"+poolID, auth.ClientID)
	}
	var store *problems.Store
	if getenv("DATABASE_URL") != "" || getenv("DATABASE_SECRET_ARN") != "" {
		if auth.ClientID != "" && private.Verifier == nil {
			return nil, errors.New("COGNITO_USER_POOL_ID is required with DATABASE_URL and COGNITO_CLIENT_ID")
		}
		pool, err := database.OpenConfigured(context.Background(), getenv)
		if err != nil {
			return nil, err
		}
		store = problems.New(pool)
		private.Store = store
		private.Profiles = profiles.New(store.Pool())
		private.Posts = posts.New(store.Pool())
		private.Submissions = &submissions.Store{Pool: store.Pool()}
		private.JudgeImage = getenv("JUDGE_CPP_IMAGE")
		private.JudgeRuntime = getenv("JUDGE_RUNTIME")
	}
	return &configuredHandler{Handler: newHandler(auth, private), store: store}, nil
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type challengeRequest struct {
	Username      string            `json:"username"`
	ChallengeName string            `json:"challenge_name"`
	Session       string            `json:"session"`
	Responses     map[string]string `json:"responses"`
}

type authResponse struct {
	AccessToken         string            `json:"access_token,omitempty"`
	IDToken             string            `json:"id_token,omitempty"`
	RefreshToken        string            `json:"refresh_token,omitempty"`
	TokenType           string            `json:"token_type,omitempty"`
	ExpiresIn           int32             `json:"expires_in,omitempty"`
	ChallengeName       string            `json:"challenge_name,omitempty"`
	ChallengeParameters map[string]string `json:"challenge_parameters,omitempty"`
	Session             string            `json:"session,omitempty"`
}

func (a AuthConfig) login(w http.ResponseWriter, r *http.Request) {
	if !a.available(w) {
		return
	}
	var input loginRequest
	if !readAuthJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Username) == "" || input.Password == "" || len(input.Username) > 128 || len(input.Password) > 256 {
		authError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	params := map[string]string{"USERNAME": input.Username, "PASSWORD": input.Password}
	a.addSecretHash(params, input.Username)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	out, err := a.Client.InitiateAuth(ctx, &cognitoidentityprovider.InitiateAuthInput{
		AuthFlow: types.AuthFlowTypeUserPasswordAuth, ClientId: aws.String(a.ClientID), AuthParameters: params,
	})
	if err != nil {
		writeCognitoError(w, err)
		return
	}
	if out == nil {
		authError(w, http.StatusBadGateway, "authentication_unavailable")
		return
	}
	writeAuthResult(w, out.AuthenticationResult, out.ChallengeName, out.ChallengeParameters, out.Session)
}

func (a AuthConfig) challenge(w http.ResponseWriter, r *http.Request) {
	if !a.available(w) {
		return
	}
	var input challengeRequest
	if !readAuthJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Username) == "" || len(input.Username) > 128 || input.Session == "" || len(input.Session) > 2048 {
		authError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	var required string
	switch input.ChallengeName {
	case "NEW_PASSWORD_REQUIRED":
		required = "NEW_PASSWORD"
	case "SMS_MFA":
		required = "SMS_MFA_CODE"
	case "SOFTWARE_TOKEN_MFA":
		required = "SOFTWARE_TOKEN_MFA_CODE"
	case "EMAIL_OTP":
		required = "EMAIL_OTP_CODE"
	default:
		authError(w, http.StatusBadRequest, "unsupported_challenge")
		return
	}
	if input.Responses[required] == "" {
		authError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	for key := range input.Responses {
		if key != required && (input.ChallengeName != "NEW_PASSWORD_REQUIRED" || !strings.HasPrefix(key, "userAttributes.")) {
			authError(w, http.StatusBadRequest, "invalid_request")
			return
		}
	}
	input.Responses["USERNAME"] = input.Username
	a.addSecretHash(input.Responses, input.Username)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	out, err := a.Client.RespondToAuthChallenge(ctx, &cognitoidentityprovider.RespondToAuthChallengeInput{
		ClientId: aws.String(a.ClientID), ChallengeName: types.ChallengeNameType(input.ChallengeName),
		Session: aws.String(input.Session), ChallengeResponses: input.Responses,
	})
	if err != nil {
		writeCognitoError(w, err)
		return
	}
	if out == nil {
		authError(w, http.StatusBadGateway, "authentication_unavailable")
		return
	}
	writeAuthResult(w, out.AuthenticationResult, out.ChallengeName, out.ChallengeParameters, out.Session)
}

func (a AuthConfig) available(w http.ResponseWriter) bool {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	if a.Client == nil || a.ClientID == "" {
		authError(w, http.StatusServiceUnavailable, "authentication_unavailable")
		return false
	}
	return true
}

func (a AuthConfig) addSecretHash(params map[string]string, username string) {
	if a.ClientSecret == "" {
		return
	}
	mac := hmac.New(sha256.New, []byte(a.ClientSecret))
	_, _ = mac.Write([]byte(username + a.ClientID))
	params["SECRET_HASH"] = base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func readAuthJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		authError(w, http.StatusUnsupportedMediaType, "json_required")
		return false
	}
	return readJSONBody(w, r, target, 16<<10)
}

func writeAuthResult(w http.ResponseWriter, tokens *types.AuthenticationResultType, challenge types.ChallengeNameType, params map[string]string, session *string) {
	if challenge != "" && aws.ToString(session) != "" {
		writeAuthJSON(w, http.StatusOK, authResponse{ChallengeName: string(challenge), ChallengeParameters: params, Session: aws.ToString(session)})
		return
	}
	if tokens == nil || aws.ToString(tokens.AccessToken) == "" || aws.ToString(tokens.IdToken) == "" || tokens.ExpiresIn <= 0 {
		authError(w, http.StatusBadGateway, "authentication_unavailable")
		return
	}
	writeAuthJSON(w, http.StatusOK, authResponse{
		AccessToken: aws.ToString(tokens.AccessToken), IDToken: aws.ToString(tokens.IdToken),
		RefreshToken: aws.ToString(tokens.RefreshToken), TokenType: aws.ToString(tokens.TokenType), ExpiresIn: tokens.ExpiresIn,
	})
}

func writeCognitoError(w http.ResponseWriter, err error) {
	var apiError smithy.APIError
	if errors.As(err, &apiError) {
		switch apiError.ErrorCode() {
		case "NotAuthorizedException", "UserNotFoundException", "UserNotConfirmedException", "PasswordResetRequiredException":
			authError(w, http.StatusUnauthorized, "invalid_credentials")
			return
		case "CodeMismatchException", "ExpiredCodeException":
			authError(w, http.StatusUnauthorized, "invalid_challenge")
			return
		case "InvalidPasswordException", "PasswordHistoryPolicyViolationException":
			authError(w, http.StatusBadRequest, "invalid_password")
			return
		case "TooManyRequestsException", "LimitExceededException", "TooManyFailedAttemptsException":
			w.Header().Set("Retry-After", "1")
			authError(w, http.StatusTooManyRequests, "too_many_requests")
			return
		}
	}
	authError(w, http.StatusBadGateway, "authentication_unavailable")
}

func authError(w http.ResponseWriter, status int, code string) {
	writeAuthJSON(w, status, map[string]string{"error": code})
}

func writeAuthJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
