<script setup lang="ts">
const config = useRuntimeConfig()
const canonical = new URL('/problems', config.public.siteUrl).href
const { data, error } = await useFetch('/api/problems')
if (error.value || !data.value) throw createError({ statusCode: 502, statusMessage: 'Problem service unavailable', fatal: true })
const items = ref(data.value.items)
const cursor = ref(data.value.nextCursor)
const loading = ref(false)
const message = ref('')
async function more() {
  loading.value = true; message.value = ''
  try { const result = await $fetch('/api/problems', { query: { cursor: cursor.value } }); items.value.push(...result.items); cursor.value = result.nextCursor }
  catch { message.value = '問題を取得できませんでした。もう一度お試しください。' }
  finally { loading.value = false }
}
useSeoMeta({ title: '公開問題 | OpenOJ', description: 'ユーザーが作成・公開したプログラミング問題。', ogTitle: '公開問題 | OpenOJ', ogUrl: canonical, ogType: 'website' })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>
<template>
  <div class="catalogue">
    <h1>公開問題</h1>
    <p v-if="!items.length" class="muted">公開された問題はまだありません。</p>
    <NuxtLink v-for="problem in items" :key="problem.id" class="problem-row" :to="`/problems/${problem.id}`">
      <span><strong>{{ problem.title }}</strong><span class="row-description">{{ problem.author }}</span></span>
      <span class="row-end" aria-hidden="true">→</span>
    </NuxtLink>
    <p v-if="message" role="alert">{{ message }}</p>
    <button v-if="cursor" class="editor-button" :disabled="loading" @click="more">さらに読み込む</button>
  </div>
</template>
<style scoped>
.problem-row { grid-template-columns: minmax(0, 1fr) auto; overflow-wrap: anywhere; margin-block: 0; border-top: 0; }
</style>
