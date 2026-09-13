<script setup lang="ts">
import { contestDate } from '~~/shared/types/contest'
import type { Submission } from '~~/shared/types/submission'
definePageMeta({ key: route => route.path })
useResponseHeader('Cache-Control').value = 'no-store'
const route = useRoute()
const id = encodeURIComponent(String(route.params.id))
const { data: item, error } = await useFetch<Submission>(`/api/contests/${id}/submissions/${encodeURIComponent(String(route.params.submission))}`)
if (error.value || !item.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: '提出が見つからないか、まだ公開されていません', fatal: true })
useSeoMeta({ title: () => `提出 | ${item.value?.problemTitle} | ShareOJ`, robots: 'noindex, nofollow' })
</script>
<template>
  <div v-if="item" class="problem-page submission-page">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink :to="`/contests/${id}#submissions`">コンテストの提出一覧</NuxtLink><span aria-hidden="true">/</span><span>提出結果</span></nav>
    <header class="problem-header"><h1>{{ item.problemTitle }}への提出</h1><div class="problem-summary"><div class="problem-meta muted"><p>提出者 {{ item.author }}</p><p><time :datetime="item.createdAt">{{ contestDate(item.createdAt) }}（日本時間）</time></p></div></div><dl class="limits"><div><dt>言語</dt><dd>{{ item.runtime }}</dd></div><div><dt>判定</dt><dd><SubmissionStatus :item="item" /></dd></div></dl></header>
    <nav class="problem-menu" aria-label="提出メニュー"><NuxtLink :to="`/contests/${id}/problems/${item.problemId}`">問題</NuxtLink><NuxtLink :to="`/contests/${id}#standings`">順位表</NuxtLink><NuxtLink :to="`/contests/${id}#submissions`">提出一覧</NuxtLink></nav>
    <section class="problem-body" aria-labelledby="source-title"><h2 id="source-title">提出コード</h2><pre class="source"><code>{{ item.source }}</code></pre></section>
  </div>
</template>
<style scoped>
.source { font-family: var(--font-code); }
</style>
