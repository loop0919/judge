package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"judge/api/internal/submissions"
)

func (p PrivateProblems) submission(w http.ResponseWriter, r *http.Request, owner string) {
	if p.Submissions == nil {
		authError(w, 503, "judging_unavailable")
		return
	}
	id := r.PathValue("id")
	if r.Method == http.MethodGet {
		if id == "" {
			items, err := p.Submissions.List(r.Context(), owner)
			if err != nil {
				authError(w, 503, "database_unavailable")
				return
			}
			writeAuthJSON(w, 200, map[string]any{"items": items})
			return
		}
		if !problemID.MatchString(id) {
			authError(w, 404, "submission_not_found")
			return
		}
		item, err := p.Submissions.Get(r.Context(), owner, id)
		if errors.Is(err, pgx.ErrNoRows) {
			authError(w, 404, "submission_not_found")
			return
		}
		if err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		writeAuthJSON(w, 200, item)
		return
	}
	if !strings.HasPrefix(p.JudgeImage, "sha256:") || len(p.JudgeImage) != 71 {
		authError(w, 503, "judging_unavailable")
		return
	}
	runtime := p.JudgeRuntime
	if runtime == "" {
		runtime = "cpp17-local"
	}
	if runtime != "cpp17-local" && runtime != "cpp17-isolate" {
		authError(w, 503, "judging_unavailable")
		return
	}
	var input struct {
		ProblemID string `json:"problemId"`
		Runtime   string `json:"runtime"`
		Source    string `json:"source"`
	}
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		authError(w, 415, "json_required")
		return
	}
	if !readJSONBody(w, r, &input, 400<<10) {
		return
	}
	if !problemID.MatchString(input.ProblemID) || (input.Runtime != "cpp17" && input.Runtime != runtime) ||
		strings.TrimSpace(input.Source) == "" || len(input.Source) > 64<<10 || !utf8.ValidString(input.Source) || strings.ContainsRune(input.Source, 0) {
		authError(w, 400, "invalid_submission")
		return
	}
	item, err := p.Submissions.CreateRuntime(r.Context(), owner, newSubmissionID(), input.ProblemID, input.Source, p.JudgeImage, runtime)
	if errors.Is(err, submissions.ErrNotReady) {
		authError(w, 409, "tests_not_ready")
		return
	}
	if err != nil {
		authError(w, 503, "database_unavailable")
		return
	}
	writeAuthJSON(w, 202, item)
}

func newSubmissionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
