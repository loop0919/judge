<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
const title = computed(() => notFound.value ? 'ページが見つかりません' : '問題を取得できませんでした')
useSeoMeta({ title: () => `${title.value} | OpenOJ`, robots: 'noindex, nofollow' })
</script>

<template>
  <NuxtLayout>
    <div class="error-page">
      <p class="eyebrow">{{ error.statusCode }}</p>
      <h1>{{ title }}</h1>
      <p>{{ notFound ? 'URL を確認するか、公開問題から選び直してください。' : '時間をおいて、もう一度アクセスしてください。' }}</p>
      <a href="/" class="return-link">公開問題へ戻る <span aria-hidden="true">→</span></a>
    </div>
  </NuxtLayout>
</template>
