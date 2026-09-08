<script setup lang="ts">
const config = useRuntimeConfig()
const canonical = new URL('/', config.public.siteUrl).href
useSeoMeta({
  title: '公開問題 | OpenOJ',
  description: 'プログラミングの問題文、制約、入出力例を確認できます。まずはサンプル問題 A + B から。',
  ogTitle: '公開問題 | OpenOJ',
  ogDescription: 'プログラミングの問題文、制約、入出力例を確認できます。',
  ogType: 'website',
  ogUrl: canonical,
})
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <div class="catalogue">
    <p class="eyebrow">PROBLEM SET</p>
    <h1>公開問題</h1>
    <p class="lead">問題文と入出力例を確認して、自分のコードで解いてみましょう。</p>
    <NuxtLink class="problem-row" to="/problems/a-plus-b">
      <span class="problem-id">a-plus-b</span>
      <span><strong>A + B</strong><span class="row-description">2 つの整数の和を求める</span></span>
      <span class="row-end">サンプル <span aria-hidden="true">↗</span></span>
    </NuxtLink>
    <p class="muted">現在はサンプル問題の閲覧に対応しています。コードの提出・採点は準備中です。</p>
  </div>
</template>
