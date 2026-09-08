<script setup lang="ts">
const config = useRuntimeConfig()
const canonical = new URL('/blog', config.public.siteUrl).href
useSeoMeta({ title: 'Blog | OpenOJ', description: 'OpenOJ の使い方と、問題を書くためのガイド。', ogTitle: 'Blog | OpenOJ', ogDescription: 'OpenOJ の使い方と、問題を書くためのガイド。', ogUrl: canonical, ogType: 'website' })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <div class="blog-index">
    <p class="eyebrow">OPENOJ BLOG</p>
    <h1>問題を書くためのガイド</h1>
    <p class="lead">書き方を知って、伝わる問題文に。</p>
    <article class="blog-entry">
      <p class="eyebrow">使い方</p>
      <h2><NuxtLink to="/blog/markdown-guide">Markdown と数式の書き方</NuxtLink></h2>
      <p>見出しやコードブロックの基本から、数式、複数行の入力形式、下書きの保存まで。</p>
    </article>
    <NuxtLink class="return-link" to="/problems/new">問題を作成する →</NuxtLink>
  </div>
</template>
