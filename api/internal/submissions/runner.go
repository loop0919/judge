package submissions

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// JudgeTimeout covers up to 100 cases, including container startup, inspection and cleanup.
const JudgeTimeout = time.Hour

// boundedOutput drains pipes after the limit and stops the container through cancel.
type boundedOutput struct {
	buffer bytes.Buffer
	limit  int
	over   bool
	cancel context.CancelFunc
	once   sync.Once
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	n := len(p)
	left := b.limit - b.buffer.Len()
	if n > left {
		_, _ = b.buffer.Write(p[:left])
		b.over = true
		b.once.Do(b.cancel)
	} else {
		_, _ = b.buffer.Write(p)
	}
	return n, nil
}

type containerResult struct {
	output, diagnostic      []byte
	code                    int
	elapsed                 time.Duration
	oom, timedOut, overflow bool
	err                     error
}

func container(ctx context.Context, image, dir, input string, memory int, deadline time.Duration, outputLimit int, command ...string) containerResult {
	var token [12]byte
	_, _ = rand.Read(token[:])
	name := "openoj-" + hex.EncodeToString(token[:])
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = exec.CommandContext(cleanup, "docker", "rm", "-f", name).Run()
	}()
	limited, cancel := context.WithTimeout(ctx, deadline)
	defer cancel()
	out := &boundedOutput{limit: outputLimit, cancel: cancel}
	diag := &boundedOutput{limit: 64 << 10, cancel: cancel}
	args := []string{"run", "--name", name, "--pull=never", "--network=none", "--read-only",
		"--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534",
		"--cpus=1", fmt.Sprintf("--memory=%dm", memory), fmt.Sprintf("--memory-swap=%dm", memory),
		"--pids-limit=64", "--ulimit=nofile=64:64", "--ulimit=fsize=33554432:33554432", "--ulimit=core=0:0",
		"--log-driver=none", "--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777", "--workdir=/tmp",
		"--mount", "type=bind,src=" + dir + ",dst=/submission,readonly", "-i", image}
	args = append(args, command...)
	cmd := exec.CommandContext(limited, "docker", args...)
	cmd.Stdin = strings.NewReader(input)
	cmd.Stdout, cmd.Stderr = out, diag
	err := cmd.Run()
	result := containerResult{output: out.buffer.Bytes(), diagnostic: diag.buffer.Bytes(), overflow: out.over || diag.over}
	if limited.Err() != nil {
		result.timedOut = !result.overflow && ctx.Err() == nil
		if ctx.Err() != nil {
			result.err = ctx.Err()
		}
		return result
	}
	inspectCtx, inspectCancel := context.WithTimeout(ctx, 5*time.Second)
	defer inspectCancel()
	state, inspectErr := exec.CommandContext(inspectCtx, "docker", "inspect", "--format={{json .State}}", name).Output()
	var status struct {
		ExitCode   int
		OOMKilled  bool
		Error      string
		Running    bool
		StartedAt  time.Time
		FinishedAt time.Time
	}
	if inspectErr != nil || json.Unmarshal(state, &status) != nil || status.Error != "" || status.Running {
		result.err = fmt.Errorf("container state unavailable")
		return result
	}
	result.code, result.oom = status.ExitCode, status.OOMKilled
	result.elapsed = status.FinishedAt.Sub(status.StartedAt)
	if err != nil && status.ExitCode == 0 {
		result.err = err
	}
	return result
}

// Judge is a local Docker adapter. It never runs submitted code on the worker host.
func Judge(ctx context.Context, source string, job Job) Result {
	r := Result{Verdict: "JE", Total: len(job.Cases)}
	if len(job.Cases) == 0 || job.TimeLimitMS < 100 || job.TimeLimitMS > 5000 || job.TimeLimitMS%100 != 0 || len(job.Cases) > 100 || job.MemoryLimitMB < 64 || job.MemoryLimitMB > 1024 || !strings.HasPrefix(job.Image, "sha256:") {
		return r
	}
	for i, c := range job.Cases {
		name := c.Name
		if name == "" {
			name = fmt.Sprintf("ケース%d", i+1)
		}
		r.Cases = append(r.Cases, CaseResult{Name: name, Verdict: "SKIPPED"})
	}
	dir, err := os.MkdirTemp("", "openoj-source-")
	if err != nil {
		return r
	}
	defer func() { _ = os.RemoveAll(dir) }()
	if os.Chmod(dir, 0755) != nil || os.WriteFile(filepath.Join(dir, "main.cpp"), []byte(source), 0644) != nil {
		return r
	}
	compiled := container(ctx, job.Image, dir, "", 1536, 30*time.Second, 32<<20,
		"sh", "-c", "g++ -std=c++17 -O2 -pipe /submission/main.cpp -o /tmp/main && cat /tmp/main")
	if compiled.err != nil {
		return r
	}
	if compiled.code != 0 || compiled.timedOut || compiled.oom || compiled.overflow {
		r.Verdict = "CE"
		r.CompileLog = strings.ToValidUTF8(string(compiled.diagnostic), "�")
		if compiled.timedOut {
			r.CompileLog = "コンパイルの制限時間を超えました。"
		}
		if compiled.oom {
			r.CompileLog = "コンパイルのメモリ上限を超えました。"
		}
		if compiled.overflow {
			r.CompileLog = "コンパイルの出力上限を超えました。"
		}
		return r
	}
	if len(compiled.output) == 0 {
		return r
	}
	if os.Remove(filepath.Join(dir, "main.cpp")) != nil || os.WriteFile(filepath.Join(dir, "main"), compiled.output, 0555) != nil {
		return r
	}
	r.Verdict = "AC"
	for i, c := range job.Cases {
		if ctx.Err() != nil {
			r.Verdict = "JE"
			return r
		}
		limit := time.Duration(job.TimeLimitMS) * time.Millisecond
		actual := container(ctx, job.Image, dir, c.Input, job.MemoryLimitMB, limit+10*time.Second, 16<<20,
			"timeout", "--signal=TERM", "--kill-after=0.1s", fmt.Sprintf("%.3fs", limit.Seconds()), "/submission/main")
		verdict := "AC"
		switch {
		case actual.err != nil || actual.timedOut:
			verdict = "JE"
		case actual.overflow:
			verdict = "OLE"
		case actual.oom:
			verdict = "MLE"
		case (actual.code == 124 || actual.code == 137) && actual.elapsed >= limit:
			verdict = "TLE"
		case actual.code != 0:
			verdict = "RE"
		case !equalTokens(actual.output, []byte(c.Output)):
			verdict = "WA"
		default:
			r.Passed++
		}
		r.Cases[i].Verdict = verdict
		if verdict == "JE" {
			r.Verdict = "JE"
			return r
		}
		if r.Verdict == "AC" && verdict != "AC" {
			r.Verdict = verdict
		}
	}
	return r
}

func equalTokens(a, b []byte) bool {
	space := func(r rune) bool { return r == ' ' || (r >= '\t' && r <= '\r') }
	x, y := bytes.FieldsFunc(a, space), bytes.FieldsFunc(b, space)
	if len(x) != len(y) {
		return false
	}
	for i := range x {
		if !bytes.Equal(x[i], y[i]) {
			return false
		}
	}
	return true
}
