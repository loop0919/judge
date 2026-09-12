package httpapi

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"judge/api/internal/problems"
	"judge/api/internal/submissions"
	"judge/api/internal/testfiles"
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
		ProblemID  string `json:"problemId"`
		Runtime    string `json:"runtime"`
		Source     string `json:"source"`
		Generation *struct {
			Mode  string `json:"mode"`
			Start int64  `json:"start"`
			Count int    `json:"count"`
		} `json:"generation"`
	}
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		authError(w, 415, "json_required")
		return
	}
	if !readJSONBody(w, r, &input, 400<<10) {
		return
	}
	selected := ""
	for _, available := range p.availableRuntimes() {
		if input.Runtime == available.ID || input.Runtime == available.ID+"-isolate" || (runtime == "cpp17-local" && input.Runtime == runtime) {
			selected = available.ID + "-isolate"
			if runtime == "cpp17-local" {
				selected = runtime
			}
			break
		}
	}
	if !problemID.MatchString(input.ProblemID) || selected == "" ||
		strings.TrimSpace(input.Source) == "" || len(input.Source) > 64<<10 || !utf8.ValidString(input.Source) || strings.ContainsRune(input.Source, 0) {
		authError(w, 400, "invalid_submission")
		return
	}
	var item submissions.Submission
	if input.Generation == nil {
		item, err = p.Submissions.CreateRuntime(r.Context(), owner, newSubmissionID(), input.ProblemID, input.Source, p.JudgeImage, selected)
	} else {
		g := input.Generation
		if p.Store == nil {
			authError(w, 503, "database_unavailable")
			return
		}
		if (g.Mode != "input" && g.Mode != "output") || g.Count < 1 || g.Count > 100 || g.Start < -2147483648 || g.Start > 2147483647-int64(g.Count-1) {
			authError(w, 400, "invalid_submission")
			return
		}
		problem, getErr := p.Store.Get(r.Context(), owner, input.ProblemID)
		if getErr != nil {
			problemError(w, getErr)
			return
		}
		job := submissions.Job{Generate: true, GenerationPrefix: testfiles.GenerationPrefix(owner, input.ProblemID), Image: p.JudgeImage, TimeLimitMS: 5000, MemoryLimitMB: 512}
		if g.Mode == "input" {
			if len(problem.Draft.TestCases)+g.Count > 100 {
				authError(w, 400, "invalid_submission")
				return
			}
			for i := 0; i < g.Count; i++ {
				job.Cases = append(job.Cases, problems.TestCase{Input: strconv.FormatInt(g.Start+int64(i), 10) + "\n"})
			}
		} else {
			// Inputs come only from this owner's saved draft, never client-supplied file references.
			if g.Start < 1 || g.Start+int64(g.Count)-1 > int64(len(problem.Draft.TestCases)) {
				authError(w, 400, "invalid_submission")
				return
			}
			for _, c := range problem.Draft.TestCases[int(g.Start)-1 : int(g.Start)-1+g.Count] {
				c.Output = ""
				c.OutputFile = nil
				job.Cases = append(job.Cases, c)
			}
		}
		for i, c := range problem.Draft.TestCases {
			if c.InputFile != nil {
				job.GenerationBaseBytes += c.InputFile.Size
			} else {
				job.GenerationBaseBytes += int64(len(c.Input))
			}
			if g.Mode == "output" && i >= int(g.Start)-1 && i < int(g.Start)-1+g.Count {
				continue
			}
			if c.OutputFile != nil {
				job.GenerationBaseBytes += c.OutputFile.Size
			} else {
				job.GenerationBaseBytes += int64(len(c.Output))
			}
		}
		if job.GenerationBaseBytes > submissions.GenerationOutputLimit {
			authError(w, 400, "invalid_submission")
			return
		}
		item, err = p.Submissions.CreateGeneration(r.Context(), owner, newSubmissionID(), input.ProblemID, input.Source, selected, job)
	}
	if errors.Is(err, submissions.ErrNotReady) {
		authError(w, 409, "tests_not_ready")
		return
	}
	if err != nil {
		authError(w, 503, "database_unavailable")
		return
	}
	if selected != "cpp17-local" && p.DispatchJudge != nil {
		// Await only the asynchronous invocation's acceptance, never the judging itself.
		// The committed DB outbox and periodic dispatcher recover a failed wake-up.
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		err := p.DispatchJudge(ctx)
		cancel()
		if err != nil {
			slog.Warn("immediate judge dispatch unavailable; periodic recovery retained", "submissionId", item.ID)
		}
	}
	writeAuthJSON(w, 202, item)
}

func (p PrivateProblems) availableRuntimes() []submissions.Runtime {
	if !strings.HasPrefix(p.JudgeImage, "sha256:") || len(p.JudgeImage) != 71 {
		return []submissions.Runtime{}
	}
	if p.JudgeRuntime == "" || p.JudgeRuntime == "cpp17-local" {
		return submissions.PublishedRuntimes("cpp17")
	}
	if p.JudgeRuntime != "cpp17-isolate" {
		return []submissions.Runtime{}
	}
	return submissions.PublishedRuntimes(p.JudgeEnabledRuntimes)
}

func (p PrivateProblems) runtimes(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	writeAuthJSON(w, 200, map[string]any{"items": p.availableRuntimes()})
}

func newSubmissionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
