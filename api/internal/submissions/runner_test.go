package submissions

import (
	"context"
	"io"
	"judge/api/internal/problems"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestOutputLimitWhileCopying(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	out := &boundedOutput{limit: 10, cancel: cancel}
	// Hide WriterTo so io.Copy also exercises the ReaderFrom optimization path.
	if _, err := io.Copy(out, struct{ io.Reader }{strings.NewReader(strings.Repeat("x", 100))}); err != nil {
		t.Fatal(err)
	}
	if out.buffer.Len() != 10 || !out.over || ctx.Err() == nil {
		t.Fatal("output limit bypassed")
	}
}

func TestTokenComparison(t *testing.T) {
	for _, tc := range []struct {
		a, b  string
		equal bool
	}{
		{"1 2\n", "\t1\r\n2 ", true}, {"", " \n", true}, {"1", "1.0", false},
		{"Yes", "YES", false}, {"1 2", "1 2 3", false}, {"a\u00a0b", "a b", false},
		{string([]byte{255}), string([]byte{254}), false},
	} {
		if got := equalTokens([]byte(tc.a), []byte(tc.b)); got != tc.equal {
			t.Errorf("%q vs %q = %v", tc.a, tc.b, got)
		}
	}
}

func TestCPPDocker(t *testing.T) {
	image := os.Getenv("TEST_JUDGE_CPP_IMAGE")
	if image == "" {
		t.Skip("TEST_JUDGE_CPP_IMAGE is required for Docker integration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	data, err := exec.CommandContext(ctx, "docker", "image", "inspect", "--format={{.Id}}", image).Output()
	if err != nil {
		t.Fatal(err)
	}
	job := Job{Image: strings.TrimSpace(string(data)), TimeLimitMS: 300, MemoryLimitMB: 64, Cases: []Case{{Name: "sample", Input: "3 5\n", Output: "8\n"}, {Name: "large", Input: "1000000000 1000000000\n", Output: "2000000000\n"}}}
	for _, tc := range []struct{ name, source, verdict string }{
		{"AC", "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b;}", "AC"},
		{"partial", "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<(a==3?a+b:0);}", "WA"},
		{"wrong then accepted", "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<(a==3?0:a+b);}", "WA"},
		{"mixed failures", "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;if(a==3){std::cout<<0;return 0;}return 1;}", "WA"},
		{"WA", "#include <iostream>\nint main(){std::cout<<0;}", "WA"},
		{"CE", "int main( {", "CE"},
		{"RE", "int main(){return 1;}", "RE"},
		{"TLE", "int main(){for(;;){}}", "TLE"},
		{"OLE", "#include <unistd.h>\nint main(){char a[8192]={};for(;;)write(1,a,sizeof a);}", "OLE"},
		{"MLE", "#include <cstdlib>\n#include <cstring>\nint main(){for(;;){volatile char* p=(char*)malloc(1048576);if(!p)return 1;for(int i=0;i<1048576;i++)p[i]=1;}}", "MLE"},
		{"isolated cases", "#include <fstream>\n#include <iostream>\nint main(){if(std::ifstream(\"/tmp/previous\").good())return 1;std::ofstream(\"/tmp/previous\")<<1;long long a,b;std::cin>>a>>b;std::cout<<a+b;}", "AC"},
		{"read-only artifact", "#include <unistd.h>\n#include <fcntl.h>\n#include <iostream>\nint main(){if(open(\"/submission/main\",O_WRONLY)>=0)return 1;long long a,b;std::cin>>a>>b;std::cout<<a+b;}", "AC"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			caseJob := job
			if tc.verdict == "OLE" {
				caseJob.TimeLimitMS = 2000
			}
			result := Judge(ctx, tc.source, caseJob)
			if result.Verdict != tc.verdict {
				t.Fatalf("got %+v, want %s", result, tc.verdict)
			}
			if len(result.Cases) != 2 || result.Cases[0].Name != "sample" || result.Cases[1].Name != "large" {
				t.Fatalf("missing case names: %+v", result)
			}
			want := []string{tc.verdict, tc.verdict}
			if tc.verdict == "AC" {
				want = []string{"AC", "AC"}
			}
			if tc.verdict == "CE" {
				want = []string{"SKIPPED", "SKIPPED"}
			}
			if tc.name == "partial" {
				want = []string{"AC", "WA"}
				if result.Passed != 1 {
					t.Fatalf("wrong passed count: %+v", result)
				}
			}
			if tc.name == "wrong then accepted" {
				want = []string{"WA", "AC"}
				if result.Passed != 1 {
					t.Fatalf("wrong passed count: %+v", result)
				}
			}
			if tc.name == "mixed failures" {
				want = []string{"WA", "RE"}
			}
			for i, verdict := range want {
				if result.Cases[i].Verdict != verdict {
					t.Fatalf("case %d: got %+v, want %s", i, result.Cases[i], verdict)
				}
			}
			if result.Verdict == "AC" && result.Passed != 2 {
				t.Fatal("did not execute all cases")
			}
		})
	}
}

func TestGeneratorDocker(t *testing.T) {
	image := os.Getenv("TEST_JUDGE_CPP_IMAGE")
	if image == "" {
		t.Skip("TEST_JUDGE_CPP_IMAGE required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	raw, err := exec.CommandContext(ctx, "docker", "image", "inspect", "--format={{.Id}}", image).Output()
	if err != nil {
		t.Fatal(err)
	}
	job := Job{Generate: true, Image: strings.TrimSpace(string(raw)), TimeLimitMS: 1000, MemoryLimitMB: 512, Cases: []Case{{Input: "7\n"}, {Input: "8\n"}}}
	var stored []string
	job.SaveOutput = func(_ context.Context, data []byte) (*problems.TestFile, error) {
		stored = append(stored, string(data))
		return &problems.TestFile{Size: int64(len(data))}, nil
	}
	result := Judge(ctx, "#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n<<\" \\n\\n\";}", job)
	if result.Verdict != "AC" || len(result.Cases) != 2 || len(stored) != 2 || stored[0] != "7 \n\n" || stored[1] != "8 \n\n" {
		t.Fatalf("generation: %+v", result)
	}
	result = Judge(ctx, "int main(){}", job)
	if result.Verdict != "AC" || result.Cases[0].Output == nil || *result.Cases[0].Output != "" {
		t.Fatalf("empty output: %+v", result)
	}
	job.Generate, job.Validate = false, true
	stored = nil
	result = Judge(ctx, "#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<\"ignored\";return n==7?0:1;}", job)
	if result.Passed != 1 || result.Cases[0].Verdict != "AC" || result.Cases[1].Verdict != "RE" || len(stored) != 0 || result.Cases[0].Output != nil {
		t.Fatalf("input validation: %+v", result)
	}
	job.Generate, job.Validate = true, false
	job.GenerationBaseBytes = GenerationOutputLimit - 32768
	result = Judge(ctx, "#include <iostream>\nint main(){for(int i=0;i<20000;i++)std::cout<<'x';}", job)
	if result.Verdict != "OLE" {
		t.Fatalf("aggregate limit: %+v", result)
	}
	job.GenerationBaseBytes = GenerationOutputLimit - (32 << 20)
	job.TimeLimitMS = 5000
	job.Cases = []Case{{Input: "16777216"}, {Input: "16777216"}}
	stored = nil
	source := "#include <iostream>\n#include <string>\nint main(){int n;std::cin>>n;std::cout<<std::string(n,'x');}"
	result = Judge(ctx, source, job)
	if result.Verdict != "AC" || len(stored) != 2 || len(stored[0]) != 16<<20 || len(stored[1]) != 16<<20 {
		t.Fatalf("16 MiB boundary: %+v", result)
	}
	job.Cases = []Case{{Input: "16777217"}}
	result = Judge(ctx, source, job)
	if result.Verdict != "OLE" {
		t.Fatalf("file limit: %+v", result)
	}
}
