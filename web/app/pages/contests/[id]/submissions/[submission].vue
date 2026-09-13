<script setup lang="ts">
import type { Submission } from '~~/shared/types/submission'
definePageMeta({ key: route => route.path })
useResponseHeader('Cache-Control').value = 'no-store'
const route = useRoute()
const id = encodeURIComponent(String(route.params.id))
const { data: item, error } = await useFetch<Submission>(`/api/contests/${id}/submissions/${encodeURIComponent(String(route.params.submission))}`)
if (error.value || !item.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: '提出が見つからないか、まだ公開されていません', fatal: true })
useSeoMeta({ title: () => `提出 | ${item.value?.problemTitle} | ShareOJ`, robots: 'noindex, nofollow' })
</script>
<template><section v-if="item" class="catalogue"><NuxtLink :to="`/contests/${id}`">コンテストへ</NuxtLink><h1>{{ item.problemTitle }}への提出</h1><p>{{ item.author }} · {{ item.runtime }}</p><SubmissionStatus :item="item" /><h2>提出コード</h2><pre class="source"><code>{{ item.source }}</code></pre></section></template>
<style scoped>.source { overflow: auto; padding: 24px; background: var(--color-surface); border: 1px solid var(--color-line); }</style>
