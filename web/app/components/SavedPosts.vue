<script setup lang="ts">
import { postListSchema, type postSummarySchema } from '~~/shared/types/post'
import type { z } from 'zod'
const posts = ref<z.infer<typeof postSummarySchema>[]>([])
const cursor = ref('')
const loading = ref(true)
const error = ref('')
async function load(more = false) {
  loading.value = true; error.value = ''
  try {
    const result = postListSchema.parse(await $fetch('/api/my/posts', { query: more ? { cursor: cursor.value } : {} }))
    posts.value = more ? [...posts.value, ...result.items] : result.items; cursor.value = result.nextCursor
  } catch { error.value = '記事を取得できませんでした。もう一度お試しください。' }
  finally { loading.value = false }
}
onMounted(() => { void load() })
</script>
<template>
  <section class="draft-library">
    <header class="draft-library-heading"><h2>作成した記事</h2><NuxtLink class="editor-button primary" to="/blog/new">記事を書く</NuxtLink></header>
    <p v-if="error" role="alert">{{ error }}</p><button v-if="error" class="editor-button" @click="load()">再試行</button>
    <p v-if="loading" role="status">記事を読み込んでいます…</p>
    <p v-else-if="!posts.length && !error" class="muted">保存した記事はまだありません。</p>
    <ul class="draft-list"><li v-for="post in posts" :key="post.id"><NuxtLink :to="{ path: '/blog/new', query: { post: post.id } }"><span class="draft-list-title">{{ post.title || '無題の記事' }}</span><span class="draft-list-meta">{{ post.publishedVersion ? '公開中' : '下書き' }}</span></NuxtLink></li></ul>
    <button v-if="cursor" class="editor-button" :disabled="loading" @click="load(true)">さらに読み込む</button>
  </section>
</template>
