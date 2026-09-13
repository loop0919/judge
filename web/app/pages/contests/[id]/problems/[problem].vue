<script setup lang="ts">
import type { Contest, ContestProblemDetail } from '~~/shared/types/contest'
definePageMeta({ key: route => route.path })
useResponseHeader('Cache-Control').value = 'no-store'
useResponseHeader('Vary').value = 'Cookie'
const route = useRoute()
const id = encodeURIComponent(String(route.params.id))
const pid = encodeURIComponent(String(route.params.problem))
const { data: contest, refresh: refreshContest } = await useFetch<Contest>(`/api/contests/${id}`)
const { data: problem, error, refresh } = await useFetch<ContestProblemDetail>(`/api/contests/${id}/problems/${pid}`)
if (error.value || !problem.value || !contest.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: '問題が見つからないか、まだ公開されていません', fatal: true })
const showingEditorial = computed(() => route.query.view === 'editorial')
const problemPath = `/contests/${id}/problems/${pid}`
useSeoMeta({ title: () => `${problem.value?.title} | ${contest.value?.title} | ShareOJ` })
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { if (!document.hidden) void Promise.all([refresh(), refreshContest()]) }, 15000) })
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <div v-if="problem && contest" class="problem-page">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink :to="`/contests/${id}`">{{ contest.title }}</NuxtLink><span aria-hidden="true">/</span><span>{{ problem.title }}</span></nav>
    <header class="problem-header"><h1>{{ problem.title }}</h1><div class="problem-summary"><div class="problem-meta muted"><p>作成者 {{ problem.author }}</p><p>配点 {{ contest.problems.find(p => p.id === problem!.id)?.points }} 点</p></div></div><dl class="limits"><div><dt>実行時間制限</dt><dd>{{ Number(problem.timeLimitMs) / 1000 }} 秒</dd></div><div><dt>メモリ制限</dt><dd>{{ problem.memoryLimitMb }} MiB</dd></div></dl></header>
    <nav class="problem-menu" aria-label="問題メニュー"><NuxtLink :to="problemPath" :aria-current="showingEditorial ? undefined : 'page'">問題</NuxtLink><NuxtLink v-if="contest.status === 'ended' || problem.editorial" :to="{ path: problemPath, query: { view: 'editorial' } }" :aria-current="showingEditorial ? 'page' : undefined">解説</NuxtLink><NuxtLink :to="`/contests/${id}#standings`">順位表</NuxtLink><NuxtLink to="/my/submissions">自分の提出</NuxtLink></nav>
    <article class="problem-body">
      <template v-if="showingEditorial"><ProblemMarkdown v-if="problem.editorial" :source="problem.editorial" /><p v-else>解説は終了後に公開されます。終了後も表示されない場合は未登録です。</p></template>
      <template v-else><ProblemMarkdown :source="problem.markdown" /><p v-if="problem.interactive" class="muted">インタラクティブ問題：応答を待つ前に出力をflushしてください。</p><p v-if="problem.specialJudge" class="muted">スペシャルジャッジ問題です。</p><p v-if="contest.status === 'ended'" class="notice">以降の提出は練習扱いで、順位には反映されません。</p><p v-else-if="contest.status === 'scheduled'" class="notice">事前のテスト提出は公式順位に含まれません。</p><SubmissionForm :problem-id="problem.id" :contest-id="contest.id" /></template>
    </article>
  </div>
</template>
