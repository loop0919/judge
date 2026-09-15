<script setup lang="ts">
import type { Submission } from '../../../../shared/types/submission'
definePageMeta({ key: route => String(route.params.id) })
useSeoMeta({ title: '提出結果 | ShareOJ', robots: 'noindex, nofollow' })
const route = useRoute()
const item = ref<Submission | null>(null)
const message = ref('')
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
async function load() {
  if (loading.value || disposed) return
  loading.value = true
  clearTimeout(timer)
  message.value = ''
  try {
    const result = await $fetch<Submission>(`/api/my/submissions/${encodeURIComponent(String(route.params.id))}`)
    if (disposed) return
    item.value = result
    if (result.status !== 'DONE') timer = setTimeout(load, 2000)
  } catch {
    if (!disposed) message.value = '提出結果を取得できませんでした。ログイン状態を確認して、再取得してください。'
  } finally { loading.value = false }
}
onMounted(load)
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <div>
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink v-if="item && (route.query.from === 'problem' || route.query.from === 'contest-problem')" :to="`${route.query.from === 'contest-problem' && item.contestId ? `/contests/${item.contestId}/problems` : '/problems'}/${item.problemId}?view=my-submissions`">この問題の自分の提出</NuxtLink><NuxtLink v-else to="/my/submissions">提出履歴</NuxtLink><span aria-hidden="true">/</span><span>提出結果</span></nav>
    <p v-if="message" class="notice notice-error" role="alert">{{ message }} <button class="editor-button" @click="load">再取得</button></p>
    <SubmissionDetail v-if="item" :item="item" />
    <p v-else-if="!message" class="muted" role="status">読み込み中…</p>
  </div>
</template>
