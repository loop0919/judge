package submissions

import "strings"

type Runtime struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Installation and publication are separate. The API defaults to C++17 only.
var Runtimes = []Runtime{
	{"cpp17", "C++17 (GCC)"},
	{"c23-gcc", "C23 (GCC)"}, {"c23-clang", "C23 (Clang)"},
	{"cpp23-gcc", "C++23 (GCC)"}, {"cpp23-clang", "C++23 (Clang)"},
	{"python314", "Python (CPython 3.14)"}, {"pypy311", "Python (PyPy 3.11)"},
	{"codon020", "Python (Codon 0.20)"}, {"rust2024", "Rust (Edition 2024)"},
	{"java24", "Java (OpenJDK 24)"},
	{"java25", "Java (Temurin 25)"}, {"csharp14", "C# 14 (.NET 10)"},
	{"nim22", "Nim 2.2"}, {"go127", "Go 1.27"},
}

func IsolateRuntimeIDs() []string {
	ids := make([]string, 0, len(Runtimes))
	for _, runtime := range Runtimes {
		ids = append(ids, runtime.ID+"-isolate")
	}
	return ids
}

func PublishedRuntimes(enabled string) []Runtime {
	if enabled == "" {
		enabled = "cpp17"
	}
	selected := make(map[string]bool)
	for _, id := range strings.Split(enabled, ",") {
		selected[strings.TrimSpace(id)] = true
	}
	result := make([]Runtime, 0)
	for _, runtime := range Runtimes {
		if selected[runtime.ID] {
			result = append(result, runtime)
		}
	}
	return result
}
