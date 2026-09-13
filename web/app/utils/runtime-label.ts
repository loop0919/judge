// Keep historical submissions readable even when a runtime is no longer published.
const runtimeLabels = new Map([
  ['cpp17', 'C++17 (GCC)'],
  ['c23-gcc', 'C23 (GCC)'],
  ['c23-clang', 'C23 (Clang)'],
  ['cpp23-gcc', 'C++23 (GCC)'],
  ['cpp23-clang', 'C++23 (Clang)'],
  ['python314', 'Python (CPython 3.14)'],
  ['pypy311', 'Python (PyPy 3.11)'],
  ['codon020', 'Python (Codon 0.20)'],
  ['rust2024', 'Rust (Edition 2024)'],
  ['java24', 'Java (OpenJDK 24)'],
])

export function runtimeLabel(runtime: string) {
  return runtimeLabels.get(runtime.replace(/-(isolate|local)$/, '')) ?? runtime
}
