<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id) })
const route = useRoute()
const { user } = useAccount()
const config = useRuntimeConfig()
const { data: problem, error } = await useFetch(() => `/api/problems/${encodeURIComponent(String(route.params.id))}`)
if (error.value || !problem.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: error.value?.statusCode === 404 ? 'Problem not found' : 'Problem service unavailable', fatal: true })
const canonical = computed(() => new URL(`/problems/${problem.value!.id}`, config.public.siteUrl).href)
useSeoMeta({ title: () => `${problem.value?.title} | ShareOJ`, description: () => problem.value?.markdown.slice(0, 160), ogTitle: () => `${problem.value?.title} | ShareOJ`, ogUrl: () => canonical.value, ogType: 'article' })
useHead(() => ({ link: [{ rel: 'canonical', href: canonical.value }] }))
</script>
<template>
  <div v-if="problem" class="problem-page">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink to="/problems">公開問題</NuxtLink><span aria-hidden="true">/</span><span>{{ problem.title }}</span></nav>
    <header class="problem-header">
      <h1>{{ problem.title }}</h1>
      <p class="muted">作成者 {{ problem.author }}</p>
      <dl class="limits"><div><dt>実行時間制限</dt><dd>{{ problem.timeLimitMs / 1000 }} 秒</dd></div><div><dt>メモリ制限</dt><dd>{{ problem.memoryLimitMb }} MiB</dd></div></dl>
    </header>
    <nav class="problem-menu" aria-label="問題メニュー">
      <NuxtLink :to="`/problems/${problem.id}`" aria-current="page">問題</NuxtLink>
      <NuxtLink v-if="user" to="/my/submissions">提出履歴</NuxtLink>
    </nav>
    <article class="problem-body" aria-label="問題詳細">
      <ProblemMarkdown :source="problem.markdown" />
      <SubmissionForm :problem-id="problem.id" />
    </article>
  </div>
</template>

<style scoped>
.problem-body { max-width: 52rem; padding-block: 32px 64px; }
.problem-header h1 { overflow-wrap: anywhere; }
.problem-menu { display: flex; flex-wrap: wrap; gap: 24px; border-bottom: 1px solid var(--color-line); }
.problem-menu a { display: inline-flex; align-items: center; min-height: 48px; padding: 10px 4px; border-bottom: 2px solid transparent; color: var(--color-muted); font-size: .875rem; text-decoration: none; }
.problem-menu a[aria-current="page"] { border-bottom-color: var(--color-accent); color: var(--color-accent); font-weight: 600; }
.problem-menu a:hover { color: var(--color-accent); background: var(--color-accent-soft); }
.notice { margin-top: 32px; }
</style>
