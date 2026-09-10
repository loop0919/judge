<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id) })
const route = useRoute()
const config = useRuntimeConfig()
const { data: problem, error } = await useFetch(() => `/api/problems/${encodeURIComponent(String(route.params.id))}`)
if (error.value || !problem.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: error.value?.statusCode === 404 ? 'Problem not found' : 'Problem service unavailable', fatal: true })
const canonical = computed(() => new URL(`/problems/${problem.value!.id}`, config.public.siteUrl).href)
useSeoMeta({ title: () => `${problem.value?.title} | OpenOJ`, description: () => problem.value?.markdown.slice(0, 160), ogTitle: () => `${problem.value?.title} | OpenOJ`, ogUrl: () => canonical.value, ogType: 'article' })
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
    <article class="problem-body" aria-label="問題詳細">
      <ProblemMarkdown :source="problem.markdown" />
      <SubmissionForm :problem-id="problem.id" />
    </article>
  </div>
</template>

<style scoped>
.problem-body { max-width: 52rem; padding-block: 32px 64px; }
.problem-header h1 { overflow-wrap: anywhere; }
.notice { margin-top: 32px; }
</style>
