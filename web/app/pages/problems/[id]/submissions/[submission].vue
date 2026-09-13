<script setup lang="ts">
import { contestDate } from '~~/shared/types/contest'
import type { Submission } from '~~/shared/types/submission'
definePageMeta({ key: route => route.path })
useResponseHeader('Cache-Control').value = 'no-store'
useResponseHeader('Vary').value = 'Cookie'
const route = useRoute()
const id = encodeURIComponent(String(route.params.id))
const { data: item, error } = await useFetch<Submission>(`/api/problems/${id}/submissions/${encodeURIComponent(String(route.params.submission))}`)
if (error.value || !item.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: '提出が見つからないか、まだ公開されていません', fatal: true })
useSeoMeta({ title: () => `提出 | ${item.value?.problemTitle} | ShareOJ`, robots: 'noindex, nofollow' })
</script>
<template>
  <div v-if="item" class="problem-page submission-page">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink :to="`/problems/${id}?view=submissions`">この問題のすべての提出</NuxtLink><span aria-hidden="true">/</span><span>提出結果</span></nav>
    <nav class="problem-menu" aria-label="提出メニュー"><NuxtLink :to="`/problems/${id}`">問題</NuxtLink><NuxtLink :to="`/problems/${id}?view=submissions`">すべての提出</NuxtLink></nav>
    <header class="problem-header"><h1>{{ item.problemTitle }}への提出</h1><div class="problem-summary"><div class="problem-meta muted"><p>提出者 {{ item.author }}</p><p><time :datetime="item.createdAt">{{ contestDate(item.createdAt) }}（日本時間）</time></p></div></div><dl class="limits"><div><dt>言語</dt><dd>{{ item.runtime }}</dd></div><div><dt>判定</dt><dd><SubmissionStatus :item="item" /></dd></div></dl></header>
    <section class="problem-body" aria-labelledby="source-title"><h2 id="source-title">提出コード</h2><pre class="source"><code>{{ item.source }}</code></pre></section>
  </div>
</template>
<style scoped>
.source { font-family: var(--font-code); }
</style>
