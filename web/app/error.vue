<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
const title = computed(() => notFound.value ? 'ページが見つかりません' : 'ページを表示できませんでした')
useSeoMeta({ title: () => `${title.value} | ShareOJ`, robots: 'noindex, nofollow' })
</script>

<template>
  <NuxtLayout>
    <div class="error-page">
      <p class="eyebrow">{{ error.statusCode }}</p>
      <h1>{{ title }}</h1>
      <p>{{ notFound ? 'URL を確認するか、問題から選び直してください。' : '時間をおいて、もう一度アクセスしてください。' }}</p>
      <a href="/problems" class="return-link">問題へ戻る <span aria-hidden="true">→</span></a>
    </div>
  </NuxtLayout>
</template>
