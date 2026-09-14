<script setup lang="ts">
const config = useRuntimeConfig()
const title = '使える言語と実行環境の仕様'
const description = 'ShareOJに提出できる言語のバージョン、コンパイル設定、追加ライブラリ、コードの書き方と実行制限を説明します。'
const canonical = new URL('/blog/language-guide', config.public.siteUrl).href
useSeoMeta({ title: `${title} | ShareOJ 記事`, description, ogTitle: title, ogDescription: description, ogType: 'article', ogUrl: canonical })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
const testlibChecker = `#include "testlib.h"
int main(int argc, char** argv) {
  registerTestlibCmd(argc, argv);
  int actual = ouf.readInt();
  int expected = ans.readInt();
  if (actual != expected) quitf(_wa, "different answer");
  quitf(_ok, "accepted");
}`
const testlibInteractor = `#include "testlib.h"
#include <iostream>
int main(int argc, char** argv) {
  registerInteraction(argc, argv);
  int n = inf.readInt();
  std::cout << n << std::endl;
  int actual = ouf.readInt();
  if (actual != 2 * n) quitf(_wa, "expected twice n");
  quitf(_ok, "accepted");
}`
</script>

<template>
  <article class="blog-article">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink to="/blog">記事</NuxtLink><span aria-hidden="true">/</span><span>{{ title }}</span></nav>
    <header class="blog-article-header">
      <p class="eyebrow">SHAREOJ GUIDE</p>
      <h1>{{ title }}</h1>
      <p class="lead">提出するコードに合わせて、言語と実行環境を選んでください。</p>
    <TweetButton :title="title" :url="canonical" /></header>
    <nav class="blog-toc" aria-label="記事の目次"><a href="#submission">提出の基本</a><a href="#languages">言語とバージョン</a><a href="#libraries">追加ライブラリ</a><a href="#testlib">testlib形式の判定</a><a href="#limits">実行制限</a></nav>
    <section id="submission">
      <h2>提出の基本</h2>
      <p>ソースコードは1ファイル、最大64 KiB（65,536バイト）です。
        通常の問題では標準入力から入力を読み、標準出力へ解答を出力してください。
        インタラクティブ問題では問題文の通信手順に従い、必要な箇所で出力をフラッシュしてください。</p>
      <p>使える言語は、提出欄の「言語」に表示されているものです。
        以下に各言語の実行環境の仕様をまとめます。
        コンパイラや実行環境は、提出時に選んだものを使います。</p>
      <p>「サンプル検証」ではサンプルケースだけを実行します。
        すべての採点用ケースで判定するには「提出する」を押してください。</p>
    </section>
    <section id="languages">
      <h2>言語とバージョン</h2>
      <div class="content-table-scroll" role="region" aria-label="言語の実行環境" tabindex="0">
        <table class="content-table">
          <thead><tr><th scope="col">言語</th><th scope="col">コンパイラ・実行環境</th><th scope="col">主な設定</th></tr></thead>
          <tbody>
            <tr><td>C23 (GCC)</td><td>GCC 16.2.0</td><td><code>-std=c23 -O2 -pipe -lm</code></td></tr>
            <tr><td>C23 (Clang)</td><td>Clang 23.1.1</td><td><code>-std=c23 -O2 -pipe -lm</code></td></tr>
            <tr><td>C++23 (GCC)</td><td>GCC 16.2.0</td><td><code>-std=c++23 -O2 -pipe</code></td></tr>
            <tr><td>C++23 (Clang)</td><td>Clang 23.1.1</td><td><code>-std=c++23 -O2 -pipe -stdlib=libstdc++</code></td></tr>
            <tr><td>Python (CPython 3.14)</td><td>CPython 3.14.7</td><td><code>python3.14 -I -B main.py</code></td></tr>
            <tr><td>Python (PyPy 3.11)</td><td>PyPy 7.3.23 / Python 3.11</td><td><code>pypy3 -I -B main.py</code></td></tr>
            <tr><td>Python (Codon 0.20)</td><td>Codon 0.20.0</td><td><code>codon build -release main.py</code></td></tr>
            <tr><td>Rust (Edition 2024)</td><td>Rust 1.98.1</td><td><code>--edition=2024 -C opt-level=2</code></td></tr>
            <tr><td>C# 14</td><td>.NET 10.0.12 / SDK 10.0.401</td><td>Roslyn、最適化有効、unsafe許可</td></tr>
            <tr><td>Java 25</td><td>Temurin 25.0.4.1+1 LTS</td><td><code>javac --release 25</code>、プレビュー機能なし</td></tr>
            <tr><td>Nim 2.2</td><td>Nim 2.2.10 / GCC 16.2.0</td><td><code>nim cpp -d:release --opt:speed --mm:refc</code></td></tr>
            <tr><td>Go 1.27</td><td>Go 1.27.1</td><td><code>go build -mod=vendor</code>、CGO無効</td></tr>
          </tbody>
        </table>
      </div>
      <p>CとC++は<code>main</code>関数、Rustは<code>fn main()</code>を含めてください。</p>
      <p>Javaは<code>Main</code>クラスの<code>public static void main(String[] args)</code>から実行します。
        C#は<code>static void Main()</code>またはトップレベルステートメント、Goは<code>package main</code>と<code>func main()</code>を含めてください。
        C#のusingはソースに記述してください。プロジェクトファイルやモジュール定義の提出は不要です。</p>
      <p>CPythonとPyPyは実行前に構文検査を行います。
        Codonはネイティブコードへコンパイルする環境で、利用できるのはCodonが対応するPythonの機能です。
        CPython連携やPyPIパッケージの追加には対応していません。</p>
    </section>
    <section id="libraries">
      <h2>追加ライブラリ</h2>
      <p>各言語の標準ライブラリに加え、次のライブラリを用意しています。
        提出時にパッケージをインストールすることはできません。</p>
      <h3>C++23（GCC・Clang共通）</h3>
      <div class="content-table-scroll" role="region" aria-label="C++23の追加ライブラリ" tabindex="0">
        <table class="content-table">
          <thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th></tr></thead>
          <tbody>
            <tr><th scope="row">AtCoder Library</th><td>1.6</td></tr>
            <tr><th scope="row">Boost（ヘッダーのみ）</th><td>1.92.0</td></tr>
            <tr><th scope="row">testlib</th><td>固定リビジョン <code>1e4e8a24c79c</code></td></tr>
          </tbody>
        </table>
      </div>
      <p>ACLは<code>#include &lt;atcoder/all&gt;</code>などで読み込めます。
        別途リンクが必要なBoostライブラリは対象外です。</p>
      <h3>CPython・PyPy</h3>
      <div class="content-table-scroll" role="region" aria-label="Pythonの追加ライブラリ" tabindex="0">
        <table class="content-table">
          <thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th><th scope="col">対応環境</th></tr></thead>
          <tbody>
            <tr><th scope="row">more-itertools</th><td>11.1.0</td><td>CPython・PyPy</td></tr>
            <tr><th scope="row">sortedcontainers</th><td>2.4.0</td><td>CPython・PyPy</td></tr>
            <tr><th scope="row">ac-library-python</th><td>固定リビジョン <code>27fdbb71cd0d</code></td><td>CPython・PyPy</td></tr>
            <tr><th scope="row">NumPy</th><td>2.5.3</td><td>CPythonのみ</td></tr>
            <tr><th scope="row">SciPy</th><td>1.18.1</td><td>CPythonのみ</td></tr>
          </tbody>
        </table>
      </div>
      <p>ac-library-pythonは<code>atcoder</code>からインポートします。</p>
      <h3>Rust</h3>
      <div class="content-table-scroll" role="region" aria-label="Rustの追加ライブラリ" tabindex="0">
        <table class="content-table">
          <thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th></tr></thead>
          <tbody>
            <tr><th scope="row">ac-library-rs</th><td>0.2.0</td></tr>
            <tr><th scope="row">fixedbitset</th><td>0.5.7</td></tr>
            <tr><th scope="row">itertools</th><td>0.15.0</td></tr>
            <tr><th scope="row">num</th><td>0.4.3</td></tr>
            <tr><th scope="row">proconio</th><td>0.6.0（derive有効）</td></tr>
            <tr><th scope="row">rand</th><td>0.10.2</td></tr>
            <tr><th scope="row">rustc-hash</th><td>2.1.3</td></tr>
          </tbody>
        </table>
      </div>
      <p>依存関係は設定済みで、<code>Cargo.toml</code>の提出は不要です。
        たとえば<code>use ac_library::Dsu;</code>や<code>use proconio::input;</code>で読み込めます。</p>
<h3>C# 14</h3>
<div class="content-table-scroll" role="region" aria-label="C# 14の追加ライブラリ" tabindex="0"><table class="content-table"><thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th><th scope="col">読み込み例</th></tr></thead><tbody>
<tr><th scope="row">MathNet.Numerics</th><td><code>5.0.0</code></td><td><code>using MathNet.Numerics.LinearAlgebra;</code></td></tr>
<tr><th scope="row">ac-library-csharp</th><td><code>4.1.4</code></td><td><code>using AtCoder;</code></td></tr>
</tbody></table></div>
<p>ACLのUnion-Findは<code>new Dsu(n)</code>で作成します。MathNet.Numericsはmanaged providerを使います。</p>
<h3>Java 25</h3>
<div class="content-table-scroll" role="region" aria-label="Java 25の追加ライブラリ" tabindex="0"><table class="content-table"><thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th><th scope="col">読み込み例</th></tr></thead><tbody>
<tr><th scope="row">ac-library-java</th><td><code>2.0.0</code></td><td><code>import ac_library.DSU;</code></td></tr>
</tbody></table></div>
<h3>Nim 2.2</h3>
<div class="content-table-scroll" role="region" aria-label="Nim 2.2の追加ライブラリ" tabindex="0"><table class="content-table"><thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th><th scope="col">読み込み例</th></tr></thead><tbody>
<tr><th scope="row">AC Library</th><td><code>v1.5.1</code></td><td><code>&lt;atcoder/dsu&gt;</code></td></tr>
<tr><th scope="row">Arraymancer</th><td><code>84af537af1bc1f90229fff2b90abf5e5c1b02616</code></td><td><code>import arraymancer</code></td></tr>
<tr><th scope="row">Eigen</th><td><code>3.4.0</code></td><td><code>&lt;Eigen/Dense&gt;</code></td></tr>
<tr><th scope="row">Nim-ACL</th><td><code>0.1.0</code></td><td><code>import atcoder/dsu</code></td></tr>
<tr><th scope="row">bigints</th><td><code>ca00f6da386af9ad7e3abf603c0201da6a014477</code></td><td><code>import bigints</code></td></tr>
<tr><th scope="row">bignum_chaemon</th><td><code>1.0.6</code></td><td><code>import bignum</code></td></tr>
<tr><th scope="row">boost</th><td><code>1.88.0</code></td><td><code>&lt;boost/multiprecision/cpp_int.hpp&gt;</code></td></tr>
<tr><th scope="row">fftw</th><td><code>3.3.10</code></td><td><code>&lt;fftw3.h&gt;</code></td></tr>
<tr><th scope="row">gmp</th><td><code>6.3.0</code></td><td><code>import gmp</code></td></tr>
<tr><th scope="row">mpfr</th><td><code>4.2.1</code></td><td><code>&lt;mpfr.h&gt;</code></td></tr>
<tr><th scope="row">neo</th><td><code>0.3.5</code></td><td><code>import neo</code></td></tr>
<tr><th scope="row">nimsimd</th><td><code>1.3.2</code></td><td><code>import nimsimd/sse2</code></td></tr>
<tr><th scope="row">regex</th><td><code>0.26.3</code></td><td><code>import regex</code></td></tr>
<tr><th scope="row">sat</th><td><code>faf1617f44d7632ee9601ebc13887644925dcc01</code></td><td><code>import sat/sat</code></td></tr>
</tbody></table></div>
<p>Nimのメモリ管理は<code>refc</code>です。bignumとそのGMPバインディングにはNim 2.2 / refc用の互換パッチを適用しています。
CPU向け機能を提供し、GPUは使用できません。SIMDは実行ホストの対応命令を確認してください。
山括弧の項目はC++ヘッダーで、NimのC++連携から使用します。GMPなどのネイティブライブラリは必要に応じて<code>{.passL: "-lgmp".}</code>のようにリンクしてください。</p>
<h3>Go 1.27</h3>
<div class="content-table-scroll" role="region" aria-label="Go 1.27の追加ライブラリ" tabindex="0"><table class="content-table"><thead><tr><th scope="col">ライブラリ</th><th scope="col">バージョン</th><th scope="col">読み込み例</th></tr></thead><tbody>
<tr><th scope="row">ac-library-go</th><td><code>v0.0.0-20260106091915-2caa314afb5a</code></td><td><code>github.com/monkukui/ac-library-go/dsu</code></td></tr>
<tr><th scope="row">gods</th><td><code>v1.18.1</code></td><td><code>github.com/emirpasic/gods/sets/treeset</code></td></tr>
<tr><th scope="row">golang_org_x_exp</th><td><code>v0.0.0-20260908205506-85c1c2202aba</code></td><td><code>golang.org/x/exp/slices</code></td></tr>
<tr><th scope="row">gonum</th><td><code>v0.17.0</code></td><td><code>gonum.org/v1/gonum/mat</code></td></tr>
<tr><th scope="row">gostl</th><td><code>v1.2.0</code></td><td><code>github.com/liyue201/gostl/ds/queue</code></td></tr>
<tr><th scope="row">immutable</th><td><code>v0.4.3</code></td><td><code>github.com/benbjohnson/immutable</code></td></tr>
</tbody></table></div>
<p>Goは上記のパッケージを<code>import</code>して使用します。モジュール定義は設定済みで、提出時のダウンロードとCGOは無効です。</p>
    </section>
    <section id="testlib">
      <h2>testlib形式の判定</h2>
      <p>C++23のGCC・Clangの両方で<code>#include "testlib.h"</code>を使用できます。
        作問画面の判定方法でスペシャルジャッジまたは対話形式を選び、「判定コードの形式」を「testlib形式」にしてください。
        既存の判定コードは「現行形式」のまま使えます。</p>
      <p>次は、提出出力と正解ファイルから整数を1つずつ読み、比較するcheckerです。
        <code>inf</code>はテスト入力、<code>ouf</code>は提出出力、<code>ans</code>は正解ファイルを読みます。</p>
      <pre><code>{{ testlibChecker }}</code></pre>
      <p>対話形式では<code>registerInteraction</code>で初期化します。
        次の例は入力ファイルの整数を提出へ送り、その2倍が返ることを確認します。
        <code>std::endl</code>で出力をフラッシュし、<code>ouf</code>で提出からの返答を読みます。</p>
      <pre><code>{{ testlibInteractor }}</code></pre>
      <p><code>_ok</code>はAC、<code>_wa</code>と<code>_pe</code>はWA、<code>_fail</code>はJEです。
        部分点（<code>quitp</code>や<code>_pc</code>）には対応していません。
        <code>tout</code>は一時ファイルで、内容を別のcheckerで判定する処理は行いません。interactor自身で正誤を決めてください。</p>
      <p>判定コードの上限はCPU 5秒、checkerは512 MiB、interactorは256 MiBです。
        制限超過はJEになります。Polygonパッケージの取り込みには対応していません。</p>
    </section>
    <section id="limits">
      <h2>実行制限</h2>
      <p>各テストケースの実行時間制限は問題ページで確認してください。
        採点ではプログラムと子プロセスの合計CPU時間を計測し、経過時間にも別の上限を設けています。</p>
      <p>メモリ上限は512 MiBで、実行環境やライブラリが使うメモリも含みます。
        コンパイル処理は別枠で、CPU時間30秒、経過時間40秒、メモリ1 GiBが上限です。</p>
      <p>NumPyやSciPyが使う数値計算ライブラリの内部スレッド数は1に設定しています。
        実行中の外部ネットワーク接続は利用できません。</p>
      <p>コンテストでの得点や誤答ペナルティについては、<NuxtLink to="/blog/contest-rules">コンテストのルール</NuxtLink>を確認してください。</p>
    </section>
    <NuxtLink class="return-link" to="/blog">記事一覧へ →</NuxtLink>
  </article>
</template>
