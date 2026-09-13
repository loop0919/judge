<script setup lang="ts">
const config = useRuntimeConfig()
const title = '使える言語と実行環境の仕様'
const description = 'ShareOJに提出できる言語のバージョン、コンパイル設定、追加ライブラリ、コードの書き方と実行制限を説明します。'
const canonical = new URL('/blog/language-guide', config.public.siteUrl).href
useSeoMeta({ title: `${title} | ShareOJ 記事`, description, ogTitle: title, ogDescription: description, ogType: 'article', ogUrl: canonical })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <article class="blog-article">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink to="/blog">記事</NuxtLink><span aria-hidden="true">/</span><span>{{ title }}</span></nav>
    <header class="blog-article-header">
      <p class="eyebrow">SHAREOJ GUIDE</p>
      <h1>{{ title }}</h1>
      <p class="lead">提出するコードに合わせて、言語と実行環境を選んでください。</p>
    </header>
    <nav class="blog-toc" aria-label="記事の目次"><a href="#submission">提出の基本</a><a href="#languages">言語とバージョン</a><a href="#libraries">追加ライブラリ</a><a href="#limits">実行制限</a></nav>
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
          </tbody>
        </table>
      </div>
      <p>CとC++は<code>main</code>関数、Rustは<code>fn main()</code>を含めてください。</p>
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
