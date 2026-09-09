package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/coreos/go-oidc/v3/oidc"
	"judge/api/internal/problems"
)

type TokenVerifier interface {
	Verify(context.Context, string) (string, error)
}

type cognitoVerifier struct {
	verifier *oidc.IDTokenVerifier
	clientID string
}

func newCognitoVerifier(issuer, clientID string) *cognitoVerifier {
	ctx := oidc.ClientContext(context.Background(), &http.Client{Timeout: 5 * time.Second})
	keys := oidc.NewRemoteKeySet(ctx, issuer+"/.well-known/jwks.json")
	return &cognitoVerifier{oidc.NewVerifier(issuer, keys, &oidc.Config{
		SkipClientIDCheck:    true, // Cognito access tokens use client_id instead of aud.
		SupportedSigningAlgs: []string{"RS256"},
	}), clientID}
}

func (v *cognitoVerifier) Verify(ctx context.Context, raw string) (string, error) {
	token, err := v.verifier.Verify(ctx, raw)
	if err != nil {
		return "", err
	}
	var claims struct {
		Use      string `json:"token_use"`
		ClientID string `json:"client_id"`
	}
	if err := token.Claims(&claims); err != nil {
		return "", err
	}
	if claims.Use != "access" || claims.ClientID != v.clientID || token.Subject == "" {
		return "", errors.New("invalid access token")
	}
	return token.Subject, nil
}

type PrivateProblems struct {
	Store    problems.Repository
	Verifier TokenVerifier
}

var problemID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

func (p PrivateProblems) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /auth/me", p.handle)
	mux.HandleFunc("GET /my/problems", p.handle)
	mux.HandleFunc("GET /my/problems/{id}", p.handle)
	mux.HandleFunc("PUT /my/problems/{id}", p.handle)
	mux.HandleFunc("DELETE /my/problems/{id}", p.handle)
}

func (p PrivateProblems) handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if p.Verifier == nil {
		authError(w, 503, "authentication_unavailable")
		return
	}
	parts := strings.Fields(r.Header.Get("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || len(parts[1]) > 16384 {
		authError(w, 401, "authentication_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	owner, err := p.Verifier.Verify(ctx, parts[1])
	if err != nil || owner == "" {
		authError(w, 401, "invalid_token")
		return
	}
	if r.URL.Path == "/auth/me" {
		writeAuthJSON(w, 200, map[string]string{"id": owner})
		return
	}
	if p.Store == nil {
		authError(w, 503, "database_unavailable")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		p.list(w, r.WithContext(ctx), owner)
		return
	}
	if !problemID.MatchString(id) {
		authError(w, 404, "problem_not_found")
		return
	}
	var result problems.Problem
	switch r.Method {
	case http.MethodGet:
		result, err = p.Store.Get(ctx, owner, id)
	case http.MethodPut:
		var input struct {
			Version int64          `json:"version"`
			Draft   problems.Draft `json:"draft"`
		}
		media, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if mediaErr != nil || media != "application/json" {
			authError(w, 415, "json_required")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 700<<10)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		decodeErr := decoder.Decode(&input)
		if decodeErr == nil {
			if e := decoder.Decode(new(any)); e != io.EOF {
				decodeErr = errors.New("trailing JSON")
				if e != nil {
					decodeErr = e
				}
			}
		}
		if decodeErr != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(decodeErr, &tooLarge) {
				authError(w, 413, "request_too_large")
			} else {
				authError(w, 400, "invalid_request")
			}
			return
		}
		if input.Version < 0 || input.Version > 9007199254740990 || !validDraft(input.Draft) {
			authError(w, 400, "invalid_draft")
			return
		}
		result, err = p.Store.Save(ctx, owner, id, input.Version, input.Draft)
	case http.MethodDelete:
		version, parseErr := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
		if parseErr != nil || version <= 0 {
			authError(w, 400, "invalid_version")
			return
		}
		err = p.Store.Delete(ctx, owner, id, version)
		if err == nil {
			w.WriteHeader(204)
			return
		}
	}
	if err != nil {
		problemError(w, err)
		return
	}
	writeAuthJSON(w, 200, result)
}

func validDraft(d problems.Draft) bool {
	timeMS, e1 := strconv.Atoi(d.TimeLimitMS)
	memory, e2 := strconv.Atoi(d.MemoryLimitMB)
	return utf8.RuneCountInString(d.Title) <= 120 && utf8.RuneCountInString(d.Markdown) <= 100000 &&
		!strings.ContainsRune(d.Title+d.Markdown, '\x00') && len(d.TimeLimitMS) <= 10 && len(d.MemoryLimitMB) <= 10 &&
		e1 == nil && e2 == nil && timeMS >= 100 && timeMS <= 5000 && timeMS%100 == 0 && memory >= 64 && memory <= 1024
}

func (p PrivateProblems) list(w http.ResponseWriter, r *http.Request, owner string) {
	var cursor *problems.Cursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		if len(raw) > 512 {
			authError(w, 400, "invalid_cursor")
			return
		}
		data, err := base64.RawURLEncoding.DecodeString(raw)
		if err != nil {
			authError(w, 400, "invalid_cursor")
			return
		}
		cursor = &problems.Cursor{}
		if json.Unmarshal(data, cursor) != nil || !problemID.MatchString(cursor.ID) || cursor.UpdatedAt.IsZero() {
			authError(w, 400, "invalid_cursor")
			return
		}
	}
	items, err := p.Store.List(r.Context(), owner, cursor)
	if err != nil {
		problemError(w, err)
		return
	}
	next := ""
	if len(items) > 50 {
		items = items[:50]
		last := items[49]
		data, _ := json.Marshal(problems.Cursor{UpdatedAt: last.UpdatedAt, ID: last.ID})
		next = base64.RawURLEncoding.EncodeToString(data)
	}
	writeAuthJSON(w, 200, struct {
		Items      []problems.Summary `json:"items"`
		NextCursor string             `json:"nextCursor"`
	}{items, next})
}

func problemError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, problems.ErrNotFound):
		authError(w, 404, "problem_not_found")
	case errors.Is(err, problems.ErrConflict):
		authError(w, 409, "version_conflict")
	default:
		authError(w, 503, "database_unavailable")
	}
}
