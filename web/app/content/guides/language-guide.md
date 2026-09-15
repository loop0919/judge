## 提出の基本 {#submission}

ソースコードは1ファイル、最大64 KiB（65,536バイト）です。 通常の問題では標準入力から入力を読み、標準出力へ解答を出力してください。 インタラクティブ問題では問題文の通信手順に従い、必要な箇所で出力をフラッシュしてください。

使える言語は、提出欄の「言語」に表示されているものです。 以下に各言語の実行環境の仕様をまとめます。 コンパイラや実行環境は、提出時に選んだものを使います。

「サンプル検証」ではサンプルケースだけを実行します。 すべての採点用ケースで判定するには「提出する」を押してください。

## 言語とバージョン {#languages}

| 言語 | コンパイラ・実行環境 | 主な設定 |
| --- | --- | --- |
| C23 (GCC) | GCC 16.2.0 | `-std=c23 -O2 -pipe -lm` |
| C23 (Clang) | Clang 23.1.1 | `-std=c23 -O2 -pipe -lm` |
| C++23 (GCC) | GCC 16.2.0 | `-std=c++23 -O2 -pipe` |
| C++23 (Clang) | Clang 23.1.1 | `-std=c++23 -O2 -pipe -stdlib=libstdc++` |
| Python (CPython 3.14) | CPython 3.14.7 | `python3.14 -I -B main.py` |
| Python (PyPy 3.11) | PyPy 7.3.23 / Python 3.11 | `pypy3 -I -B main.py` |
| Python (Codon 0.20) | Codon 0.20.0 | `codon build -release main.py` |
| Rust (Edition 2024) | Rust 1.98.1 | `--edition=2024 -C opt-level=2` |
| C# 14 | .NET 10.0.12 / SDK 10.0.401 | Roslyn、最適化有効、unsafe許可 |
| Java 25 | Temurin 25.0.4.1+1 LTS | `javac --release 25`、プレビュー機能なし |
| Nim 2.2 | Nim 2.2.10 / GCC 16.2.0 | `nim cpp -d:release --opt:speed --mm:refc` |
| Go 1.27 | Go 1.27.1 | `go build -mod=vendor`、CGO無効 |

CとC++は`main`関数、Rustは`fn main()`を含めてください。

Javaは`Main`クラスの`public static void main(String[] args)`から実行します。 C#は`static void Main()`またはトップレベルステートメント、Goは`package main`と`func main()`を含めてください。 C#のusingはソースに記述してください。プロジェクトファイルやモジュール定義の提出は不要です。

CPythonとPyPyは実行前に構文検査を行います。 Codonはネイティブコードへコンパイルする環境で、利用できるのはCodonが対応するPythonの機能です。 CPython連携やPyPIパッケージの追加には対応していません。

## 追加ライブラリ {#libraries}

各言語の標準ライブラリに加え、次のライブラリを用意しています。 提出時にパッケージをインストールすることはできません。

### C++23（GCC・Clang共通）

| ライブラリ | バージョン |
| --- | --- |
| AtCoder Library | 1.6 |
| Boost（ヘッダーのみ） | 1.92.0 |
| testlib | 固定リビジョン `1e4e8a24c79c` |

ACLは`#include <atcoder/all>`などで読み込めます。 別途リンクが必要なBoostライブラリは対象外です。

### CPython・PyPy

| ライブラリ | バージョン | 対応環境 |
| --- | --- | --- |
| more-itertools | 11.1.0 | CPython・PyPy |
| sortedcontainers | 2.4.0 | CPython・PyPy |
| ac-library-python | 固定リビジョン `27fdbb71cd0d` | CPython・PyPy |
| NumPy | 2.5.3 | CPythonのみ |
| SciPy | 1.18.1 | CPythonのみ |

ac-library-pythonは`atcoder`からインポートします。

### Rust

| ライブラリ | バージョン |
| --- | --- |
| ac-library-rs | 0.2.0 |
| fixedbitset | 0.5.7 |
| itertools | 0.15.0 |
| num | 0.4.3 |
| proconio | 0.6.0（derive有効） |
| rand | 0.10.2 |
| rustc-hash | 2.1.3 |

依存関係は設定済みで、`Cargo.toml`の提出は不要です。 たとえば`use ac_library::Dsu;`や`use proconio::input;`で読み込めます。

### C# 14

| ライブラリ | バージョン | 読み込み例 |
| --- | --- | --- |
| MathNet.Numerics | `5.0.0` | `using MathNet.Numerics.LinearAlgebra;` |
| ac-library-csharp | `4.1.4` | `using AtCoder;` |

ACLのUnion-Findは`new Dsu(n)`で作成します。MathNet.Numericsはmanaged providerを使います。

### Java 25

| ライブラリ | バージョン | 読み込み例 |
| --- | --- | --- |
| ac-library-java | `2.0.0` | `import ac_library.DSU;` |

### Nim 2.2

| ライブラリ | バージョン | 読み込み例 |
| --- | --- | --- |
| AC Library | `v1.5.1` | `<atcoder/dsu>` |
| Arraymancer | `84af537af1bc1f90229fff2b90abf5e5c1b02616` | `import arraymancer` |
| Eigen | `3.4.0` | `<Eigen/Dense>` |
| Nim-ACL | `0.1.0` | `import atcoder/dsu` |
| bigints | `ca00f6da386af9ad7e3abf603c0201da6a014477` | `import bigints` |
| bignum_chaemon | `1.0.6` | `import bignum` |
| boost | `1.88.0` | `<boost/multiprecision/cpp_int.hpp>` |
| fftw | `3.3.10` | `<fftw3.h>` |
| gmp | `6.3.0` | `import gmp` |
| mpfr | `4.2.1` | `<mpfr.h>` |
| neo | `0.3.5` | `import neo` |
| nimsimd | `1.3.2` | `import nimsimd/sse2` |
| regex | `0.26.3` | `import regex` |
| sat | `faf1617f44d7632ee9601ebc13887644925dcc01` | `import sat/sat` |

Nimのメモリ管理は`refc`です。bignumとそのGMPバインディングにはNim 2.2 / refc用の互換パッチを適用しています。 CPU向け機能を提供し、GPUは使用できません。SIMDは実行ホストの対応命令を確認してください。 山括弧の項目はC++ヘッダーで、NimのC++連携から使用します。GMPなどのネイティブライブラリは必要に応じて`{.passL: "-lgmp".}`のようにリンクしてください。

### Go 1.27

| ライブラリ | バージョン | 読み込み例 |
| --- | --- | --- |
| ac-library-go | `v0.0.0-20260106091915-2caa314afb5a` | `github.com/monkukui/ac-library-go/dsu` |
| gods | `v1.18.1` | `github.com/emirpasic/gods/sets/treeset` |
| golang_org_x_exp | `v0.0.0-20260908205506-85c1c2202aba` | `golang.org/x/exp/slices` |
| gonum | `v0.17.0` | `gonum.org/v1/gonum/mat` |
| gostl | `v1.2.0` | `github.com/liyue201/gostl/ds/queue` |
| immutable | `v0.4.3` | `github.com/benbjohnson/immutable` |

Goは上記のパッケージを`import`して使用します。モジュール定義は設定済みで、提出時のダウンロードとCGOは無効です。

## testlib形式の判定 {#testlib}

C++23のGCC・Clangの両方で`#include "testlib.h"`を使用できます。 作問画面の判定方法でスペシャルジャッジまたは対話形式を選び、「判定コードの形式」を「testlib形式」にしてください。 既存の判定コードは「現行形式」のまま使えます。

次は、提出出力と正解ファイルから整数を1つずつ読み、比較するcheckerです。 `inf`はテスト入力、`ouf`は提出出力、`ans`は正解ファイルを読みます。

```cpp
#include "testlib.h"
int main(int argc, char** argv) {
  registerTestlibCmd(argc, argv);
  int actual = ouf.readInt();
  int expected = ans.readInt();
  if (actual != expected) quitf(_wa, "different answer");
  quitf(_ok, "accepted");
}
```

対話形式では`registerInteraction`で初期化します。 次の例は入力ファイルの整数を提出へ送り、その2倍が返ることを確認します。 `std::endl`で出力をフラッシュし、`ouf`で提出からの返答を読みます。

```cpp
#include "testlib.h"
#include <iostream>
int main(int argc, char** argv) {
  registerInteraction(argc, argv);
  int n = inf.readInt();
  std::cout << n << std::endl;
  int actual = ouf.readInt();
  if (actual != 2 * n) quitf(_wa, "expected twice n");
  quitf(_ok, "accepted");
}
```

`_ok`はAC、`_wa`と`_pe`はWA、`_fail`はJEです。 部分点（`quitp`や`_pc`）には対応していません。 `tout`は一時ファイルで、内容を別のcheckerで判定する処理は行いません。interactor自身で正誤を決めてください。

判定コードの上限はCPU 5秒、checkerは512 MiB、interactorは256 MiBです。 制限超過はJEになります。Polygonパッケージの取り込みには対応していません。

## 実行制限 {#limits}

各テストケースの実行時間制限は問題ページで確認してください。 採点ではプログラムと子プロセスの合計CPU時間を計測し、経過時間にも別の上限を設けています。

メモリ上限は512 MiBで、実行環境やライブラリが使うメモリも含みます。 コンパイル処理は別枠で、CPU時間30秒、経過時間40秒、メモリ1 GiBが上限です。

NumPyやSciPyが使う数値計算ライブラリの内部スレッド数は1に設定しています。 実行中の外部ネットワーク接続は利用できません。

コンテストでの得点や誤答ペナルティについては、[コンテストのルール](/blog/contest-rules)を確認してください。
