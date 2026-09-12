package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"judge/api/internal/problems"
)

func contentJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		authError(w, 415, "json_required")
		return false
	}
	return readJSONBody(w, r, target, 700<<10)
}

func contentCursor(w http.ResponseWriter, r *http.Request) (*problems.Cursor, bool) {
	raw := r.URL.Query().Get("cursor")
	if raw == "" {
		return nil, true
	}
	if len(raw) > 512 {
		authError(w, 400, "invalid_cursor")
		return nil, false
	}
	data, err := base64.RawURLEncoding.DecodeString(raw)
	var c problems.Cursor
	if err != nil || json.Unmarshal(data, &c) != nil || !problemID.MatchString(c.ID) || c.UpdatedAt.IsZero() {
		authError(w, 400, "invalid_cursor")
		return nil, false
	}
	return &c, true
}

func nextContentCursor(id string, date time.Time) string {
	data, _ := json.Marshal(problems.Cursor{ID: id, UpdatedAt: date})
	return base64.RawURLEncoding.EncodeToString(data)
}

func (p PrivateProblems) publicContent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	id := r.PathValue("id")
	if id != "" && !problemID.MatchString(id) {
		authError(w, 404, "not_found")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if strings.HasPrefix(r.URL.Path, "/posts") {
		if p.Posts == nil {
			authError(w, 503, "database_unavailable")
			return
		}
		if id != "" {
			post, err := p.Posts.PublicGet(ctx, id)
			if err != nil {
				problemError(w, err)
				return
			}
			post.Operator = p.Operators[post.Owner]
			writeAuthJSON(w, 200, post)
			return
		}
		cursor, ok := contentCursor(w, r)
		if !ok {
			return
		}
		list, err := p.Posts.PublicList(ctx, cursor)
		if err != nil {
			problemError(w, err)
			return
		}
		next := ""
		if len(list) > 50 {
			list = list[:50]
			last := list[49]
			next = nextContentCursor(last.ID, *last.PublishedAt)
		}
		for i := range list {
			list[i].Operator = p.Operators[list[i].Owner]
		}
		writeAuthJSON(w, 200, map[string]any{"items": list, "nextCursor": next})
		return
	}
	store, ok := p.Store.(problems.Publications)
	if !ok {
		authError(w, 503, "database_unavailable")
		return
	}
	if id != "" {
		value, err := store.PublicGet(ctx, id)
		if err != nil {
			problemError(w, err)
			return
		}
		writeAuthJSON(w, 200, value)
		return
	}
	cursor, ok := contentCursor(w, r)
	if !ok {
		return
	}
	list, err := store.PublicList(ctx, cursor)
	if err != nil {
		problemError(w, err)
		return
	}
	next := ""
	if len(list) > 50 {
		list = list[:50]
		last := list[49]
		next = nextContentCursor(last.ID, last.PublishedAt)
	}
	writeAuthJSON(w, 200, map[string]any{"items": list, "nextCursor": next})
}

type publicationInput struct {
	Version int64 `json:"version"`
	Publish *bool `json:"publish"`
}

func publicationRequest(w http.ResponseWriter, r *http.Request) (publicationInput, bool) {
	var in publicationInput
	if !contentJSON(w, r, &in) {
		return in, false
	}
	if in.Version <= 0 || in.Publish == nil {
		authError(w, 400, "invalid_request")
		return in, false
	}
	return in, true
}

func (p PrivateProblems) publishProblem(w http.ResponseWriter, r *http.Request, owner string) {
	id := r.PathValue("id")
	if !problemID.MatchString(id) {
		authError(w, 404, "problem_not_found")
		return
	}
	store, ok := p.Store.(problems.Publications)
	if !ok {
		authError(w, 503, "database_unavailable")
		return
	}
	in, ok := publicationRequest(w, r)
	if !ok {
		return
	}
	current, err := p.Store.Get(r.Context(), owner, id)
	if err != nil {
		problemError(w, err)
		return
	}
	if *in.Publish && (strings.TrimSpace(current.Draft.Title) == "" || strings.TrimSpace(current.Draft.Markdown) == "" || !validDraft(current.Draft)) {
		authError(w, 400, "incomplete_problem")
		return
	}
	if *in.Publish && current.Draft.Checker != nil {
		available := false
		for _, runtime := range p.availableRuntimes() {
			available = available || runtime.ID == current.Draft.Checker.Runtime
		}
		if !available || strings.TrimSpace(current.Draft.Checker.Source) == "" {
			authError(w, 400, "incomplete_problem")
			return
		}
	}
	result, err := store.Publish(r.Context(), owner, id, in.Version, *in.Publish)
	if err != nil {
		problemError(w, err)
		return
	}
	writeAuthJSON(w, 200, result)
}

func (p PrivateProblems) privatePost(w http.ResponseWriter, r *http.Request, owner string) {
	if p.Posts == nil {
		authError(w, 503, "database_unavailable")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		cursor, ok := contentCursor(w, r)
		if !ok {
			return
		}
		list, err := p.Posts.List(r.Context(), owner, cursor)
		if err != nil {
			problemError(w, err)
			return
		}
		next := ""
		if len(list) > 50 {
			list = list[:50]
			last := list[49]
			next = nextContentCursor(last.ID, last.UpdatedAt)
		}
		writeAuthJSON(w, 200, map[string]any{"items": list, "nextCursor": next})
		return
	}
	if !problemID.MatchString(id) {
		authError(w, 404, "post_not_found")
		return
	}
	if strings.HasSuffix(r.URL.Path, "/publication") {
		in, ok := publicationRequest(w, r)
		if !ok {
			return
		}
		current, err := p.Posts.Get(r.Context(), owner, id)
		if err != nil {
			problemError(w, err)
			return
		}
		if *in.Publish && (strings.TrimSpace(current.Title) == "" || strings.TrimSpace(current.Markdown) == "") {
			authError(w, 400, "incomplete_post")
			return
		}
		result, err := p.Posts.Publish(r.Context(), owner, id, in.Version, *in.Publish)
		if err != nil {
			problemError(w, err)
			return
		}
		writeAuthJSON(w, 200, result)
		return
	}
	switch r.Method {
	case http.MethodGet:
		result, err := p.Posts.Get(r.Context(), owner, id)
		if err != nil {
			problemError(w, err)
			return
		}
		writeAuthJSON(w, 200, result)
	case http.MethodPut:
		var in struct {
			Version  int64  `json:"version"`
			Title    string `json:"title"`
			Markdown string `json:"markdown"`
		}
		if !contentJSON(w, r, &in) {
			return
		}
		if in.Version < 0 || in.Version > 9007199254740990 || utf8.RuneCountInString(in.Title) > 120 || utf8.RuneCountInString(in.Markdown) > 100000 || strings.ContainsRune(in.Title+in.Markdown, '\x00') {
			authError(w, 400, "invalid_post")
			return
		}
		result, err := p.Posts.Save(r.Context(), owner, id, in.Title, in.Markdown, in.Version)
		if err != nil {
			problemError(w, err)
			return
		}
		writeAuthJSON(w, 200, result)
	case http.MethodDelete:
		version, err := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
		if err != nil || version <= 0 {
			authError(w, 400, "invalid_version")
			return
		}
		if err = p.Posts.Delete(r.Context(), owner, id, version); err != nil {
			problemError(w, err)
			return
		}
		w.WriteHeader(204)
	}
}
