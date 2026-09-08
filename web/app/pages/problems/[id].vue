<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id) })
const route = useRoute()
const config = useRuntimeConfig()
const { data: problem, error } = await useFetch(() => `/api/problems/${encodeURIComponent(String(route.params.id))}`)

if (error.value || !problem.value) {
  throw createError({
    statusCode: error.value?.statusCode === 404 ? 404 : 502,
    statusMessage: error.value?.statusCode === 404 ? 'Problem not found' : 'Problem service unavailable',
    fatal: true,
  })
}

const canonical = computed(() => new URL(`/problems/${encodeURIComponent(problem.value!.id)}`, config.public.siteUrl).href)
useSeoMeta({
  title: () => `${problem.value?.title} | OpenOJ`,
  description: () => problem.value?.description,
  ogTitle: () => `${problem.value?.title} | OpenOJ`,
  ogDescription: () => problem.value?.description,
  ogType: 'article',
  ogUrl: () => canonical.value,
})
useHead(() => ({ link: [{ rel: 'canonical', href: canonical.value }] }))
</script>

<template>
  <div v-if="problem" class="problem-page">
    <nav class="breadcrumb" aria-label="パンくずリスト">
      <NuxtLink to="/">公開問題</NuxtLink><span aria-hidden="true">/</span><span>{{ problem.id }}</span>
    </nav>
    <header class="problem-header">
      <p class="eyebrow">{{ problem.id }}<span v-if="problem.isSample" class="sample-label">サンプル問題</span></p>
      <h1>{{ problem.title }}</h1>
      <dl class="limits">
        <div><dt>実行時間制限</dt><dd>{{ problem.timeLimitMs / 1000 }} 秒</dd></div>
        <div><dt>メモリ制限</dt><dd>{{ problem.memoryLimitMb }} MB</dd></div>
      </dl>
    </header>
    <div class="problem-layout">
      <article class="problem-body" aria-label="問題詳細">
        <section id="statement">
          <h2>問題文</h2>
          <p v-for="paragraph in problem.statement" :key="paragraph"><MathText :text="paragraph" /></p>
        </section>
        <section id="constraints">
          <h2>制約</h2>
          <ul><li v-for="constraint in problem.constraints" :key="constraint"><MathText :text="constraint" /></li></ul>
        </section>
        <section id="input">
          <h2>入力</h2>
          <p>入力は以下の形式で標準入力から与えられます。</p>
          <div class="input-format"><MathText :text="problem.inputFormat" /></div>
        </section>
        <section id="output">
          <h2>出力</h2>
          <p><MathText :text="problem.outputFormat" /></p>
        </section>
        <section id="samples">
          <h2>入出力例</h2>
          <div v-for="(sample, index) in problem.samples" :key="index" class="sample">
            <div class="sample-grid">
              <div><h3>入力例 {{ index + 1 }}</h3><pre><code>{{ sample.input }}</code></pre></div>
              <div><h3>出力例 {{ index + 1 }}</h3><pre><code>{{ sample.output }}</code></pre></div>
            </div>
            <p><MathText :text="sample.explanation" /></p>
          </div>
        </section>
        <aside class="notice" aria-label="提出について">
          <strong>提出・採点は準備中です</strong>
          <p>今は問題の閲覧に対応しています。お手元の開発環境でコードを書き、入出力例を試してみてください。</p>
        </aside>
      </article>
      <aside class="contents">
        <nav aria-label="この問題の目次">
          <p>この問題の目次</p>
          <a href="#statement">問題文</a>
          <a href="#constraints">制約</a>
          <a href="#input">入力</a>
          <a href="#output">出力</a>
          <a href="#samples">入出力例</a>
        </nav>
      </aside>
    </div>
  </div>
</template>
