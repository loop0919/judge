<script setup lang="ts">
import type { Submission } from '../../../../shared/types/submission'
definePageMeta({ key: route => String(route.params.id) })
useSeoMeta({ title: '提出結果 | OpenOJ', robots: 'noindex, nofollow' })
const route = useRoute()
const item = ref<Submission | null>(null)
const message = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const verdicts: Record<string, string> = { AC: '正解', WA: '不正解', CE: 'コンパイルエラー', RE: '実行時エラー', TLE: '実行時間超過', MLE: 'メモリ超過', OLE: '出力超過', JE: '採点できませんでした' }
const status = computed(() => item.value?.result ? `${item.value.result.verdict}：${verdicts[item.value.result.verdict] ?? ''}` : item.value?.status === 'QUEUED' ? '待機中' : '採点中')
async function load() {
  clearTimeout(timer)
  message.value = ''
  try {
    const result = await $fetch<Submission>(`/api/my/submissions/${encodeURIComponent(String(route.params.id))}`)
    if (disposed) return
    item.value = result
    if (result.status !== 'DONE') timer = setTimeout(load, 2000)
  } catch {
    if (!disposed) message.value = '提出結果を取得できませんでした。ログイン状態を確認して、再取得してください。'
  }
}
onMounted(load)
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <section class="submission-detail">
    <NuxtLink to="/my/submissions">自分の提出履歴</NuxtLink>
    <h1>提出結果</h1>
    <p v-if="message" role="alert">{{ message }} <button @click="load">再取得</button></p>
    <template v-if="item">
      <h2>{{ item.problemTitle }}</h2>
      <p>問題の版：{{ item.problemVersion }} ／ C++17（ローカル開発用）</p>
      <p role="status" aria-live="polite">{{ status }}</p>
      <p v-if="item.result">正解したケース：{{ item.result.passed }} / {{ item.result.total }}</p>
      <p v-if="item.status === 'QUEUED'" class="muted">順番に採点します。開発環境ではジャッジワーカーの起動が必要です。</p>
      <pre v-if="item.result?.compileLog" aria-label="コンパイル診断">{{ item.result.compileLog }}</pre>
      <details><summary>提出したコード</summary><pre>{{ item.source }}</pre></details>
      <NuxtLink :to="`/problems/${item.problemId}`">問題へ戻る</NuxtLink>
    </template>
    <p v-else-if="!message" role="status">読み込み中…</p>
  </section>
</template>

<style scoped>
.submission-detail { max-width: 52rem; padding-block: 32px 64px; }
pre { max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; padding: 16px; background: var(--color-accent-soft); }
details { margin-block: 24px; }
</style>
