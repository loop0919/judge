<script setup lang="ts">
type Item = { id: string, title: string, publishedAt: string | null }
type Page = { items: Item[], nextCursor: string }
const props = defineProps<{ initial: Page, kind: 'problems' | 'posts', fetchPage: (cursor: string) => Promise<Page> }>()
const { current, index, loading, message, move } = useContentPages(props.initial, props.fetchPage)
const label = props.kind === 'problems' ? '問題' : '記事'
</script>
<template>
  <p v-if="!current.items.length" class="muted">公開された{{ label }}はまだありません。</p>
  <div v-else class="content-table-scroll" role="region" :aria-label="`公開済みの${label}`" tabindex="0" :aria-busy="loading">
    <table class="content-table">
      <thead><tr><th scope="col">タイトル</th><th scope="col">公開日</th></tr></thead>
      <tbody><tr v-for="item in current.items" :key="item.id">
        <th scope="row"><NuxtLink :to="`/${kind === 'posts' ? 'blog' : 'problems'}/${item.id}`">{{ item.title }}</NuxtLink></th>
        <td><time v-if="item.publishedAt" :datetime="item.publishedAt">{{ new Date(item.publishedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) }}</time></td>
      </tr></tbody>
    </table>
  </div>
  <p v-if="message" role="alert">{{ message }}</p>
  <ContentPagination :index="index" :has-next="!!current.nextCursor" :loading="loading" @move="move" />
</template>
