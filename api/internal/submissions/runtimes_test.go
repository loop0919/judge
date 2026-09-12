package submissions

import "testing"

func TestPublishedRuntimes(t *testing.T) {
	if got := PublishedRuntimes(""); len(got) != 1 || got[0].ID != "cpp17" {
		t.Fatal(got)
	}
	if got := PublishedRuntimes("none"); len(got) != 0 {
		t.Fatal(got)
	}
	got := PublishedRuntimes("cpp17,c23-gcc,java24,unknown,c23-gcc")
	if len(got) != 3 || got[1].ID != "c23-gcc" || got[2].ID != "java24" {
		t.Fatal(got)
	}
}
