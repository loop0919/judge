package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"

	"judge/api/internal/submissions"
)

func TestRetiredCPP17IsHiddenAndRejected(t *testing.T) {
	p := PrivateProblems{JudgeImage: "sha256:" + strings.Repeat("a", 64), JudgeRuntime: "cpp17-isolate",
		JudgeEnabledRuntimes: "c23-gcc,c23-clang,python314,pypy311,codon020,rust2024,cpp23-gcc,cpp23-clang",
		Submissions:          &submissions.Store{}}
	catalog := p.availableRuntimes()
	if len(catalog) != 8 {
		t.Fatalf("unexpected catalog: %+v", catalog)
	}
	for _, runtime := range catalog {
		if runtime.ID == "cpp17" || runtime.ID == "java24" {
			t.Fatalf("unpublished runtime: %+v", runtime)
		}
	}
	for _, runtime := range []string{"cpp17", "cpp17-isolate", "cpp17-local"} {
		r := httptest.NewRequest("POST", "/my/submissions", strings.NewReader(`{"problemId":"11111111-1111-4111-8111-111111111111","runtime":"`+runtime+`","source":"int main(){}"}`))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		p.submission(w, r, "alice")
		if w.Code != 400 || !strings.Contains(w.Body.String(), "invalid_submission") {
			t.Fatalf("%s accepted: %d %s", runtime, w.Code, w.Body.String())
		}
	}
}

func TestRuntimeCatalogFollowsAdmissionConfiguration(t *testing.T) {
	p := PrivateProblems{JudgeImage: "sha256:" + strings.Repeat("a", 64), JudgeRuntime: "cpp17-isolate"}
	for _, enabled := range []string{"", "cpp17,c23-gcc", "none"} {
		p.JudgeEnabledRuntimes = enabled
		r := httptest.NewRecorder()
		newHandler(AuthConfig{}, p).ServeHTTP(r, httptest.NewRequest("GET", "/runtimes", nil))
		if r.Code != 200 || r.Header().Get("Cache-Control") != "no-store" {
			t.Fatal(r)
		}
		if strings.Contains(r.Body.String(), "java24") {
			t.Fatal("unverified runtime published")
		}
		if enabled == "none" && strings.TrimSpace(r.Body.String()) != "{\"items\":[]}" {
			t.Fatal(r.Body.String())
		}
		if strings.Contains(r.Body.String(), "c23-gcc") != (enabled == "cpp17,c23-gcc") {
			t.Fatal(r.Body.String())
		}
	}
	p.JudgeImage = ""
	if len(p.availableRuntimes()) != 0 {
		t.Fatal("disabled judge advertised runtimes")
	}
}
