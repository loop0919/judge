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
  <a :href="href" class="tweet-button" target="_blank" rel="noopener noreferrer" aria-label="Xでシェア（新しいタブで開く）" title="Xでシェア">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>
  </a>
</template>

<style scoped>
.tweet-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 44px; width: 44px; height: 44px; color: #000; border-radius: 4px; }
.tweet-button:hover { background: var(--color-surface); }
.tweet-button:active { transform: translateY(1px); }
</style>
