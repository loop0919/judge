<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id) })
const route = useRoute()
const config = useRuntimeConfig()
const { data: post, error } = await useFetch(() => `/api/posts/${encodeURIComponent(String(route.params.id))}`)
if (error.value || !post.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: error.value?.statusCode === 404 ? '記事が見つかりません' : '記事を取得できませんでした', fatal: true })
const canonical = computed(() => new URL(`/blog/${post.value!.id}`, config.public.siteUrl).href)
useSeoMeta({ title: () => `${post.value?.title} | ShareOJ`, description: () => post.value?.markdown.slice(0, 160), ogTitle: () => `${post.value?.title} | ShareOJ`, ogUrl: () => canonical.value, ogType: 'article' })
useHead(() => ({ link: [{ rel: 'canonical', href: canonical.value }] }))
</script>
<template>
  <article v-if="post" class="post-page">
    <NuxtLink to="/blog">記事へ戻る</NuxtLink>
    <h1>{{ post.title }}</h1>
    <p class="muted">{{ post.author }} <span v-if="post.isOperator">・運営</span> · <time :datetime="post.publishedAt">{{ new Date(post.publishedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) }}</time></p>
    <ProblemMarkdown :source="post.markdown" />
  </article>
</template>
<style scoped>
.post-page { margin: 40px 0 80px; overflow-wrap: anywhere; }
</style>
