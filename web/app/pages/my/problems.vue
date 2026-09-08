<script setup lang="ts">
import { listDrafts, migrateLegacyDraft, type DraftEntry } from '~/utils/draft-library'
useSeoMeta({ title: '自分の問題 | OpenOJ', robots: 'noindex, nofollow' })
const entries = ref<DraftEntry[]>([])
const loading = ref(true)
const error = ref('')
function refresh() {
  error.value = ''
  try {
    try { migrateLegacyDraft(localStorage) } catch { error.value = '以前の下書きを読み込めませんでした。元のデータは保持しています。' }
    const result = listDrafts(localStorage)
    entries.value = result.entries
    if (result.unreadable) error.value = `${result.unreadable} 件の下書きを読み込めませんでした。元のデータは保持しています。`
  } catch { error.value = 'ブラウザーの保存領域にアクセスできません。設定を確認して再読み込みしてください。' }
  loading.value = false
}
const updatedLabel = (date: string) => new Date(date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
onMounted(() => { refresh(); window.addEventListener('storage', refresh) })
onBeforeUnmount(() => window.removeEventListener('storage', refresh))
</script>

<template>
  <section class="draft-library">
    <header class="draft-library-heading">
      <div><h1>自分の問題</h1><p class="muted">このブラウザーに保存した下書きです。問題はまだ公開されていません。</p></div>
      <NuxtLink class="editor-button primary" to="/problems/new?fresh=1">新しい問題を作成</NuxtLink>
    </header>
    <p v-if="error" role="alert" class="editor-error">{{ error }}</p>
    <p v-if="loading" role="status">下書きを読み込んでいます…</p>
    <div v-else-if="!entries.length" class="draft-empty"><h2>まだ問題がありません</h2><p>最初の問題を書いて、下書きとして保存してみましょう。</p></div>
    <ul v-else class="draft-list">
      <li v-for="entry in entries" :key="entry.id">
        <NuxtLink :to="{ path: '/problems/new', query: { draft: entry.id } }">
          <span class="draft-list-title">{{ entry.draft.title.trim() || '無題の問題' }}</span>
          <span class="draft-list-meta"><span>下書き</span><time :datetime="entry.updatedAt">更新 {{ updatedLabel(entry.updatedAt) }}</time><span aria-hidden="true">→</span></span>
        </NuxtLink>
      </li>
    </ul>
    <p class="draft-library-note muted">別のブラウザーや端末とは共有されません。ブラウザーのサイトデータを削除すると、下書きも削除されます。</p>
  </section>
</template>
