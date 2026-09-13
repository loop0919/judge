<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id) })
const route = useRoute()
const { user } = useAccount()
const config = useRuntimeConfig()
useResponseHeader('Cache-Control').value = 'no-store'
useResponseHeader('Vary').value = 'Cookie'
const { data: problem, error } = await useFetch(() => `/api/problems/${encodeURIComponent(String(route.params.id))}`)
if (error.value || !problem.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: error.value?.statusCode === 404 ? 'Problem not found' : 'Problem service unavailable', fatal: true })
const showingEditorial = computed(() => route.query.view === 'editorial')
useSeoMeta({ robots: () => problem.value?.isPrivate ? 'noindex, nofollow' : undefined })
const canonical = computed(() => new URL(`/problems/${problem.value!.id}`, config.public.siteUrl).href)
useSeoMeta({ title: () => `${showingEditorial.value ? '解説 | ' : ''}${problem.value?.title} | ShareOJ`, description: () => (showingEditorial.value ? problem.value?.editorial : problem.value?.markdown)?.slice(0, 160), ogTitle: () => `${problem.value?.title} | ShareOJ`, ogUrl: () => canonical.value, ogType: 'article' })
useHead(() => ({ link: [{ rel: 'canonical', href: canonical.value }] }))
</script>
<template>
  <div v-if="problem" class="problem-page">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink :to="problem.isPrivate ? '/my' : '/problems'">{{ problem.isPrivate ? 'マイページ' : '問題' }}</NuxtLink><span aria-hidden="true">/</span><span>{{ problem.title }}</span></nav>
    <header class="problem-header">
      <h1>{{ problem.title }}</h1>
      <p v-if="problem.isPrivate" class="muted">非公開 · 作成者本人のみ閲覧・提出できます。</p>
      <div class="problem-meta muted">
        <p>作成者 {{ problem.author }}</p>
        <p>難易度（作成者設定） <DifficultyBadge :level="problem.difficulty" /></p>
      </div>
      <ProblemFavorite v-if="!problem.isPrivate" :problem-id="problem.id" :count="problem.favoriteCount" />
      <dl class="limits"><div><dt>実行時間制限</dt><dd>{{ problem.timeLimitMs / 1000 }} 秒</dd></div><div><dt>メモリ制限</dt><dd>{{ problem.memoryLimitMb }} MiB</dd></div></dl>
    </header>
    <nav class="problem-menu" aria-label="問題メニュー">
      <NuxtLink :to="`/problems/${problem.id}`" :aria-current="showingEditorial ? undefined : 'page'">問題</NuxtLink>
      <NuxtLink :to="{ path: `/problems/${problem.id}`, query: { view: 'editorial' } }" :aria-current="showingEditorial ? 'page' : undefined">解説</NuxtLink>
      <NuxtLink v-if="user" to="/my/submissions">提出履歴</NuxtLink>
    </nav>
    <article class="problem-body" aria-label="問題詳細">
      <template v-if="showingEditorial">
        <ProblemMarkdown v-if="problem.editorial" :source="problem.editorial" />
        <p v-else class="muted">解説はまだありません。</p>
      </template>
      <template v-else>
        <ProblemMarkdown :source="problem.markdown" />
        <p v-if="problem.interactive" class="muted">インタラクティブ問題：標準入出力でジャッジと対話します。応答を待つ前に出力をflushしてください。</p>
        <p v-if="problem.specialJudge" class="muted">スペシャルジャッジ問題：提出の出力を検証コードで判定します。</p>
        <SubmissionForm :problem-id="problem.id" />
      </template>
    </article>
  </div>
</template>

<style scoped>
.problem-body { max-width: 52rem; padding-block: 32px 64px; }
.problem-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; margin-bottom: 16px; }
.problem-meta p { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; overflow-wrap: anywhere; min-width: 0; }
.problem-header h1 { overflow-wrap: anywhere; }
.problem-menu { display: flex; flex-wrap: wrap; gap: 24px; border-bottom: 1px solid var(--color-line); }
.problem-menu a { display: inline-flex; align-items: center; min-height: 48px; padding: 10px 4px; border-bottom: 2px solid transparent; color: var(--color-muted); font-size: .875rem; text-decoration: none; }
.problem-menu a[aria-current="page"] { border-bottom-color: var(--color-accent); color: var(--color-accent); font-weight: 600; }
.problem-menu a:hover { color: var(--color-accent); background: var(--color-accent-soft); }
.notice { margin-top: 32px; }
</style>
