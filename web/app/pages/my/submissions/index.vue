<script setup lang="ts">
import type { Submission } from '../../../../shared/types/submission'
useSeoMeta({ title: '自分の提出 | OpenOJ', robots: 'noindex, nofollow' })
const items = ref<Submission[]>([])
const loading = ref(true)
const message = ref('')
async function load() {
  loading.value = true
  message.value = ''
  try { items.value = (await $fetch<{ items: Submission[] }>('/api/my/submissions')).items }
  catch { message.value = '提出履歴を取得できませんでした。ログイン状態を確認してください。' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="draft-library">
    <h1>自分の提出</h1>
    <p class="muted">最新50件を表示します。</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="loading" role="status">読み込み中…</p>
    <p v-else-if="!items.length && !message">提出はまだありません。</p>
    <ul class="draft-list">
      <li v-for="item in items" :key="item.id">
        <NuxtLink :to="`/my/submissions/${item.id}`">
          <span class="draft-list-title">{{ item.problemTitle }}</span>
          <span>{{ item.result?.verdict ?? (item.status === 'QUEUED' ? '待機中' : '採点中') }}</span>
          <time :datetime="item.createdAt">{{ new Date(item.createdAt).toLocaleString('ja-JP') }}</time>
        </NuxtLink>
      </li>
    </ul>
    <button :disabled="loading" @click="load">更新</button>
  </section>
</template>
