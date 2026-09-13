<script setup lang="ts">
import type { z } from 'zod'
import type { postListSchema } from '~~/shared/types/post'
const config = useRuntimeConfig()
const canonical = new URL('/blog', config.public.siteUrl).href
const { user } = useAccount()
const { data, error } = await useFetch('/api/posts')
if (error.value || !data.value) throw createError({ statusCode: 502, statusMessage: '記事を取得できませんでした', fatal: true })
const { current, index, loading, message, move } = useContentPages(data.value, cursor => $fetch<z.infer<typeof postListSchema>>('/api/posts', { query: { cursor } }))
const date = (value: string) => new Date(value).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
useSeoMeta({ title: '記事 | ShareOJ', description: 'ユーザーと運営が投稿する記事。', ogTitle: '記事 | ShareOJ', ogUrl: canonical, ogType: 'website' })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>
<template>
  <div class="catalogue">
    <header class="blog-heading"><h1>記事</h1><NuxtLink v-if="user" class="editor-button primary" to="/blog/new">新規記事</NuxtLink></header>
    <p v-if="!current.items.length" class="muted">公開された記事はまだありません。</p>
    <div v-else class="content-table-scroll" tabindex="0" role="region" aria-label="記事一覧" :aria-busy="loading">
      <table class="content-table">
        <thead><tr><th scope="col">タイトル</th><th scope="col">投稿者</th><th scope="col">公開日</th></tr></thead>
        <tbody><tr v-for="post in current.items" :key="post.id">
          <th scope="row"><NuxtLink :to="`/blog/${post.id}`">{{ post.title }}</NuxtLink></th>
          <td>{{ post.author }} <span v-if="post.isOperator" class="operator-label">運営</span></td>
          <td><time v-if="post.publishedAt" :datetime="post.publishedAt">{{ date(post.publishedAt) }}</time><span v-else>—</span></td>
        </tr></tbody>
      </table>
    </div>
    <p v-if="message" role="alert">{{ message }}</p>
    <ContentPagination :index="index" :has-next="!!current.nextCursor" :loading="loading" @move="move" />
    <p><NuxtLink to="/blog/contest-rules">コンテストのルール</NuxtLink></p>
    <p><NuxtLink to="/blog/language-guide">使える言語と実行環境の仕様</NuxtLink></p>
    <p><NuxtLink to="/blog/generator-guide">入出力生成と入力検証の使い方</NuxtLink></p>
    <p><NuxtLink to="/blog/markdown-guide">Markdown・数式の書き方</NuxtLink></p>
  </div>
</template>
<style scoped>
.blog-heading { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin: 12px 0 24px; }
.blog-heading h1 { margin: 0; }
.operator-label { color: var(--color-accent); border: 1px solid var(--color-line); padding: 2px 6px; border-radius: 4px; font-size: .75rem; }
@media (max-width: 40rem) { .blog-heading { flex-direction: column; align-items: flex-start; } }
</style>
