package submissions

import (
	"context"
	"io"
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
	job := Job{Image: strings.TrimSpace(string(data)), TimeLimitMS: 300, MemoryLimitMB: 64, Cases: []Case{{Input: "3 5\n", Output: "8\n"}, {Input: "1000000000 1000000000\n", Output: "2000000000\n"}}}
	for _, tc := range []struct{ name, source, verdict string }{
		{"AC", "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b;}", "AC"},
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
			if result.Verdict == "AC" && result.Passed != 2 {
				t.Fatal("did not execute all cases")
			}
		})
	}
}
