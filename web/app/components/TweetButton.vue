<script setup lang="ts">
const props = defineProps<{ title: string, url: string }>()
const config = useRuntimeConfig()
const href = computed(() => `https://x.com/intent/tweet?${new URLSearchParams({
  text: props.title,
  url: new URL(props.url, config.public.siteUrl).href,
  hashtags: 'ShareOJ',
})}`)
</script>

<template>
  <a :href="href" class="editor-button tweet-button" target="_blank" rel="noopener noreferrer" aria-label="Xでシェア（新しいタブで開く）">Tweet</a>
</template>

<style scoped>
.tweet-button { min-height: 40px; padding: 8px 16px; }
</style>
