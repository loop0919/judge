# ADR 0007: 競技プログラミング向けのランタイム構成を限定する

- 状態：Accepted
- 決定日：2026-09-12

## 背景

初期ジャッジでは、C、C++、Java、Rustと複数のPythonランタイムをアルゴリズム競技に提供する。
AtCoderの実行環境には機械学習、数理最適化、データ分析、言語連携を含む多数のパッケージがあるが、同じ構成を採用する必要はない。

CとC++では、GCCとClangで対応する言語機能、拡張機能と診断結果が異なる。
一方のコンパイラだけを提供すると、もう一方を前提とする提出を受け付けられない。

提供パッケージが増えると、ランタイムイメージ、依存関係、ネイティブ拡張、脆弱性対応とsmoke testの対象も増える。
OpenOJは2 GBのLightsailインスタンスで採点し、ユーザープログラムを512 MiBに制限するため、初期構成ではアルゴリズム競技で使う範囲へ限定する。

ランタイム識別子は、コンパイラ、コンパイル引数、利用できるライブラリとその版を含む。
コンパイラまたはライブラリ構成を変更した場合は、同じ識別子のまま既存提出を異なる条件で採点できない。

## 検討した選択肢

### AtCoderと同程度のパッケージを提供する

利用者はAtCoder向けのコードを変更せずに提出しやすい。
一方、機械学習、数理最適化、データ分析、JITコンパイルなどのパッケージは、初期のアルゴリズム競技では用途が限られる。
これらを含めると、ビルド、更新、起動時メモリと異常系検証の対象が広がるため採用しない。

### 各言語の標準ライブラリだけを提供する

ランタイムの構築と更新を最も単純にできる。
ただし、ACL、順序付き集合、FFTや科学計算など、競技プログラミングで再利用しやすい機能も利用できなくなるため採用しない。

### CとC++でGCCだけを提供する

構築するランタイム数を減らせる。
ただし、Clangの言語機能、拡張機能と診断を前提とする提出を受け付けられないため採用しない。

### GCCとClangを別ランタイムとして提供する

利用者がコンパイラを明示的に選択でき、提出ごとの実行条件もランタイム識別子で固定できるため、この構成を採用する。

### 用途を限定した追加ライブラリを提供する

標準ライブラリで不足するデータ構造と数値計算を補いつつ、依存関係と検証対象を限定できるため、この構成を採用する。

## 決定

Cでは、C23のGCC版とClang版を別のランタイムとして提供する。
C++では、C++23のGCC版とClang版を別のランタイムとして提供する。
コンパイラを自動選択またはフォールバックせず、提出時に指定されたランタイムだけを使う。

Clang++版は当初libstdc++を使い、libc++版を追加しない。
GCC版とClang版の双方で、C++標準ライブラリに加えて同じBoostのヘッダー群とAtCoder Libraryを提供する。
別途リンクが必要なBoostライブラリは初期対象に含めない。

Javaでは、OpenJDK 24を提供し、プレビュー機能を有効にするコンパイル引数は指定しない。
初期ランタイムにはOpenJDK 24.0.2、ac-library-java 2.0.0とBifurcan 0.2.0-rc1を採用する。
Bifurcan 0.2.0-rc1はプレリリースであるが、Javaランタイムでは指定された版を例外として採用する。

Rustでは、Rust 1.98.1とEdition 2024を採用し、nightly toolchainは提供しない。
Rust 1.98.0には誤コンパイルの問題があるため、その修正版である1.98.1へ固定する。
競技プログラミングで標準ライブラリを補う次のcrateを直接利用できるようにする。
初期ランタイムでは、2026年9月12日時点でcrates.ioが示す最新の、yankされていない安定版を採用する。

- ac-library-rs 0.2.0。
- fixedbitset 0.5.7。
- itertools 0.15.0。
- num 0.4.3。
- proconio 0.6.0。
- rand 0.10.2。
- rustc-hash 2.1.3。

選択したcrateの推移的依存関係はCargo.lockへ固定するが、利用者が直接使用できるcrateとして保証しない。
crateの取得と依存解決はランタイム構築時に完了させ、提出のコンパイル時にはネットワークへ接続しない。

CPythonでは、次のパッケージを提供する。

- NumPy。
- SciPy。
- more-itertools。
- sortedcontainers。
- ac-library-python。

PyPyでは、pure Pythonで提供できる次のパッケージを初期対象とする。

- more-itertools。
- sortedcontainers。
- ac-library-python。

PyPy向けのNumPyとSciPyは、互換性、実行時間とメモリ使用量を実機で確認するまで提供しない。
CodonではCPython連携とPyPIパッケージを提供せず、Codonがネイティブに対応する機能だけを利用可能にする。

機械学習、数理最適化、データ分析、記号計算、汎用グラフ処理、JITコンパイルと言語連携のパッケージは初期対象に含めない。
具体的には、PyTorch、LightGBM、scikit-learn、pandas、Polars、OR-Tools、Z3、PuLP、SymPy、NetworkX、Numba、Cythonとcppyyを提供しない。

採用したコンパイラとライブラリの正確な版、コンパイル引数、配布物とSHA-256はランタイムのmanifestへ固定する。
コンパイラ、コンパイル引数、版または配布物を変更するときは、新しいruntime digestを発行し、smoke test後に有効化する。
パッケージ管理コマンドと外部ネットワークは提出環境へ公開しない。

## 影響と未決事項

問題作成者は、このADRに記載したライブラリ以外を解答から利用できる前提にしない。
選択したパッケージの推移的依存関係はイメージへ含まれ得るが、利用者向けAPIとして保証しない。

NumPyとSciPyについて、512 MiBのケース用メモリ上限でimportと代表的な数値計算を実行できることを確認する。
ネイティブ数値ライブラリが作るスレッド数を制限し、CPU時間とメモリ計測への影響を検証する。
ac-library-pythonについて、採用する配布物を固定し、AtCoder Library Practice Contest相当の操作をsmoke testへ含める。
BoostとAtCoder Libraryについて、GCC版とClang版の双方で代表的なコードをコンパイルして実行する。
Javaについて、512 MiBのケース用メモリ上限に収まるヒープ、スタックとネイティブメモリの配分を実機で決める。
ac-library-javaとBifurcanをクラスパスへ固定し、代表的なデータ構造を使うコードをsmoke testへ含める。
Rustについて、Rust 1.98.1とEdition 2024で、選択したcrateを同時に依存関係へ指定したCargo.lockを生成し、全crateを使う提出をオフラインでコンパイルする。

この決定はコンパイラとライブラリの選定であり、各ランタイムの構築と有効化の完了を意味しない。
Cで追加ライブラリを提供するかは、このADRでは決定しない。
OpenJDK 24は上流の現行リリースではないため、有効化前に採用する配布物の保守状況を確認する。
2026年9月12日の実装時に、[OpenJDK 24の公式配布ページ](https://jdk.java.net/24/)が最新のセキュリティ修正を含まない旧版として扱っていることを確認した。
利用者の追加決定により、Javaは配置とsmoke testまでを実施し、公開を保留する。
保守されている版への変更は別途決定する。

## 関連文書

- [ジャッジのランタイム方針](../judge/runtime-policy.md)
- [ジャッジの実行モデル](../judge/execution-model.md)
- [ADR 0006](0006-use-lightsail-and-isolate.md)

## 参考資料

- [AtCoderで利用可能なPythonのサードパーティライブラリ](https://atcoder.jp/contests/APG4bPython/tasks/APG4bPython_aj)
- [AtCoder Library](https://github.com/atcoder/ac-library)
- [Boost C++ Libraries](https://www.boost.org/releases/latest/)
- [PyPy FAQ](https://doc.pypy.org/faq.html)
- [JDK Builds from Oracle](https://jdk.java.net/)
- [ac-library-java](https://github.com/ocha98/ac-library-java/releases/tag/v2.0.0)
- [Bifurcan](https://central.sonatype.com/artifact/io.lacuna/bifurcan)
- [crates.io](https://crates.io/)
- [Rust 1.98.1](https://blog.rust-lang.org/releases/1.98.1/)
