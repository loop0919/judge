<script setup lang="ts">
const config = useRuntimeConfig()
const canonical = new URL('/blog', config.public.siteUrl).href
const { user } = useAccount()
const { data, error } = await useFetch('/api/posts')
if (error.value || !data.value) throw createError({ statusCode: 502, statusMessage: '記事を取得できませんでした', fatal: true })
const items = ref(data.value.items)
const cursor = ref(data.value.nextCursor)
const loading = ref(false)
const message = ref('')
async function more() {
  loading.value = true; message.value = ''
  try { const result = await $fetch('/api/posts', { query: { cursor: cursor.value } }); items.value.push(...result.items); cursor.value = result.nextCursor }
  catch { message.value = '記事を取得できませんでした。もう一度お試しください。' }
  finally { loading.value = false }
}
const date = (value: string) => new Date(value).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
useSeoMeta({ title: 'ブログ | ShareOJ', description: 'ユーザーと運営が投稿する記事。', ogTitle: 'ブログ | ShareOJ', ogUrl: canonical, ogType: 'website' })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>
<template>
  <div class="blog-index">
    <header class="blog-heading"><h1>ブログ</h1><NuxtLink v-if="user" class="editor-button primary" to="/blog/new">記事を書く</NuxtLink></header>
    <p v-if="!items.length" class="muted">公開された記事はまだありません。</p>
    <article v-for="post in items" :key="post.id" class="blog-entry">
      <p class="muted">{{ post.author }} <span v-if="post.isOperator" class="operator-label">運営</span> · <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ date(post.publishedAt) }}</time></p>
      <h2><NuxtLink :to="`/blog/${post.id}`">{{ post.title }}</NuxtLink></h2>
    </article>
    <p v-if="message" role="alert">{{ message }}</p>
    <button v-if="cursor" class="editor-button" :disabled="loading" @click="more">さらに読み込む</button>
    <p><NuxtLink to="/blog/generator-guide">入出力生成と入力検証の使い方</NuxtLink></p>
    <p><NuxtLink to="/blog/markdown-guide">Markdown・数式の書き方</NuxtLink></p>
  </div>
</template>
<style scoped>
.blog-entry { overflow-wrap: anywhere; margin-top: 0; border-top: 0; }
.blog-heading { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.blog-heading h1 { margin: 0; }
.operator-label { color: var(--color-accent); border: 1px solid var(--color-line); padding: 2px 6px; border-radius: 4px; font-size: .75rem; }
</style>
