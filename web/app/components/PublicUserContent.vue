<script setup lang="ts">
const props = defineProps<{ handle: string, kind: 'problems' | 'posts' }>()
const endpoint = `/api/${props.kind}` as const
type Item = { id: string, title: string, publishedAt: string | null }
type Page = { items: Item[], nextCursor: string }
const fetchPage = (cursor: string) => $fetch<Page>(endpoint, { query: { author: props.handle, cursor } })
const { data, error, refresh } = await useAsyncData(`user-content:${props.handle}:${props.kind}`, () => fetchPage(''))
const pages = computed(() => data.value)
</script>
<template>
  <div class="catalogue">
    <p v-if="error" role="alert">一覧を取得できませんでした。<button class="editor-button" @click="refresh()">再試行</button></p>
    <UserContentTable v-else-if="pages" :key="`${handle}:${kind}`" :initial="pages" :kind="kind" :fetch-page="fetchPage" />
    <p v-else role="status">読み込み中…</p>
  </div>
</template>
