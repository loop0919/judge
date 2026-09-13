<script setup lang="ts">
const config = useRuntimeConfig()
const title = '入出力生成と入力検証の使い方'
const description = 'コードによる入力と期待出力の生成、入力の制約を検証する手順をC++17の例で紹介します。'
const canonical = new URL('/blog/generator-guide', config.public.siteUrl).href
useSeoMeta({ title: `${title} | ShareOJ 記事`, description, ogTitle: title, ogDescription: description, ogType: 'article', ogUrl: canonical })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
const inputCode = '#include <iostream>\n\nint main() {\n    long long case_number;\n    std::cin >> case_number;\n    std::cout << case_number << " " << case_number + 1 << "\\n";\n}'
const outputCode = '#include <iostream>\n\nint main() {\n    long long a, b;\n    std::cin >> a >> b;\n    std::cout << a + b << "\\n";\n}'
const validationCode = '#include <iostream>\n\nint main() {\n    long long a, b;\n    if (!(std::cin >> a >> b)) return 1;\n    if (a < 0 || a > 1000000000 || b < 0 || b > 1000000000) return 1;\n    std::cin >> std::ws;\n    return std::cin.eof() ? 0 : 1;\n}'
</script>

<template>
  <article class="blog-article">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink to="/blog">記事</NuxtLink><span aria-hidden="true">/</span><span>生成と検証ガイド</span></nav>
    <header class="blog-article-header">
      <p class="eyebrow">SHAREOJ GUIDE</p>
      <h1>{{ title }}</h1>
      <p class="lead">テストケースをコードで作れます。ケース番号から入力を生成し、その入力を解答プログラムに渡して期待出力を揃えましょう。</p>
    </header>
    <nav class="blog-toc" aria-label="記事の目次"><a href="#input">入力を作る</a><a href="#output">期待出力を作る</a><a href="#validation">入力を検証する</a><a href="#steps">画面での手順</a><a href="#limits">上限と失敗時の動作</a><a href="#check">生成後の確認</a></nav>
    <section id="input">
      <h2>ケース番号から入力を作る</h2>
      <p>問題作成画面のサイドバーで「生成と検証」を開き、種類を「入力生成」にします。開始ケース番号と生成件数を指定すると、番号を1ずつ増やしながら、各ケースについてプログラムを実行します。</p>
      <p>現在の実装では、ケース番号は標準入力に整数1個と改行で渡されます。プログラムの第一引数ではなく、C++なら <code>std::cin</code> から読み取ってください。標準出力に書いた文字列が、新しいテストケースの入力になります。</p>
      <p>たとえば「2つの整数の和」を求める問題なら、次のC++17プログラムで入力を作れます。</p>
      <pre><code>{{ inputCode }}</code></pre>
      <p>開始ケース番号を7、生成件数を3にすると、次の3件が追加されます。既存のテストケースは残り、新しいケースの期待出力は空になります。</p>
      <div class="guide-table"><table><thead><tr><th>標準入力のケース番号</th><th>生成される入力</th></tr></thead><tbody><tr><td>7</td><td><code>7 8</code> と改行</td></tr><tr><td>8</td><td><code>8 9</code> と改行</td></tr><tr><td>9</td><td><code>9 10</code> と改行</td></tr></tbody></table></div>
      <p>ケース番号ごとに最小値、最大値、重複する値などを出力する分岐を書けば、条件の異なる入力をまとめて用意できます。乱数を使う場合はケース番号をシードにすると、同じ番号から同じ入力を再現しやすくなります。</p>
    </section>
    <section id="output">
      <h2>解答プログラムから期待出力を作る</h2>
      <p>種類を「出力生成」にすると、既存ケースの入力が標準入力へ渡されます。問題を解くプログラムを書き、その答えを標準出力へ出してください。</p>
      <pre><code>{{ outputCode }}</code></pre>
      <p>入力が <code>7 8</code> なら、期待出力は <code>15</code> と改行になります。標準出力の空白と改行はそのまま保存されます。デバッグ用の表示は期待出力に混ざるため、標準出力には答えだけを書いてください。</p>
      <p>出力生成の「開始位置」は、テストケース一覧の上から数えた位置です。1が先頭を表し、入力生成で使ったケース番号やファイル名とは別です。開始位置1、生成件数3なら、一覧の先頭3件の期待出力を置き換えます。</p>
    </section>
    <section id="validation">
      <h2>入力が制約を満たすか検証する</h2>
      <p>種類を「入力検証」にすると、指定した既存ケースの入力が標準入力へ渡されます。終了コード0で合格、0以外の終了コードや異常終了で不合格になります。標準出力は保存せず、入力と期待出力も変更しません。</p>
      <p>次のC++17の例では、0以上10億以下の整数が2つだけあることを検証します。末尾の空白と改行は許可します。</p>
      <pre><code>{{ validationCode }}</code></pre>
      <p>「開始位置」と「検証件数」で対象を指定し、「検証する」を押してください。ケースごとの結果が表示されます。時間超過（TLE）、メモリ超過（MLE）、出力超過（OLE）は「検証未完了」です。コードや実行条件を確認して再実行してください。</p>
      <p>この例は整数の値と個数を検証します。行数や区切り文字まで厳密に指定する問題では、その形式もコードで検証してください。</p>
    </section>
    <section id="steps">
      <h2>画面で生成して確認する</h2>
      <ol>
        <li>ログインして問題を開き、サイドバーの「生成と検証」を選びます。</li>
        <li>「入力生成」で言語とコード、開始ケース番号、生成件数を設定し、「生成する」を押します。</li>
        <li>完了したら「テストケースを確認」で入力を確認します。</li>
        <li>「生成と検証」に戻り、「出力生成」で解答コードと対象範囲を設定します。</li>
        <li>「生成する」を押し、期待出力を上書きする確認に同意します。完了後に入出力の組を確認してください。</li>
      </ol>
      <p>入力生成・出力生成・入力検証のコードと言語はそれぞれ下書きに保存されます。実行前には下書きを保存し、生成結果も通常のテストケースと同じく自動保存されます。採点への反映には問題一覧の「投稿」から公開するか、「問題管理」から公開内容を更新してください。</p>
    </section>
    <section id="limits">
      <h2>上限と失敗時の動作</h2>
      <ul>
        <li>入力と期待出力は、それぞれUTF-8で16 MiB（16,777,216バイト）までです。</li>
        <li>既存データを含むテストケース全体は512 MiB、ケース数は100件までです。期待出力を置き換える場合、古い期待出力は置き換え後の合計に含めません。</li>
        <li>各ケースの実行時間は5秒、メモリは512 MiB、ソースコードは64 KiBまでです。</li>
        <li>生成件数は1〜100件、入力生成のケース番号は符号付き32ビット整数の範囲です。空の入出力も有効ですが、NUL文字や不正なUTF-8は使えません。</li>
      </ul>
      <p>コンパイルエラー、実行エラー、時間超過、容量超過、ファイル検証の失敗がある場合は、結果を反映せず既存のテストケースを保持します。画面のエラーを確認し、コードや対象範囲を修正して再実行してください。</p>
    </section>
    <section id="check">
      <h2>生成した答えも確認する</h2>
      <p>出力生成が正常終了しても、その答えが正しいとは限りません。解答コードの誤りが、そのまま期待出力になるためです。手計算できる小さなケースや、別の方法で求めた答えと照合してください。</p>
      <p>入力が問題の制約を満たすかも確認します。この例は連続する2つの整数を作るだけなので、最小値や最大値を含むケースは問題に合わせて追加しましょう。</p>
    </section>
    <NuxtLink class="return-link" to="/problems/new">問題作成画面へ →</NuxtLink>
  </article>
</template>

<style scoped>
.guide-table { overflow-x: auto; }
</style>
