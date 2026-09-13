<script setup lang="ts">
import { accountListSchema, accountProblemSchema, accountError, type AccountSummary } from '~/utils/account-problems'
useSeoMeta({ title: '問題を投稿 | ShareOJ', robots: 'noindex, nofollow' })
const available = ref<AccountSummary[]>([])
const selected = ref('')
const loading = ref(true)
const busy = ref(false)
const message = ref('')
async function load() {
  loading.value = true
  message.value = ''
  available.value = []
  try {
    let cursor = ''
    do {
      const page = accountListSchema.parse(await $fetch('/api/my/problems', { query: { cursor } }))
      available.value.push(...page.items.filter(p => !p.publishedVersion && !p.contestId))
      cursor = page.nextCursor
    } while (cursor)
  } catch (error) { message.value = accountError(error) }
  finally { loading.value = false }
}
onMounted(load)
async function post() {
  if (busy.value || loading.value || !selected.value) return
  if (!window.confirm('選択した問題を投稿しますか？誰でも閲覧できるようになります。')) return
  busy.value = true
  message.value = ''
  try {
    const problem = accountProblemSchema.parse(await $fetch(`/api/my/problems/${selected.value}`))
    if (!problem.draft.title.trim() || !problem.draft.markdown.trim()) { message.value = '投稿するには問題のタイトルと本文を入力してください。'; return }
    if (problem.publishedVersion) { message.value = 'この問題はすでに公開されています。別の問題を選んでください。'; return }
    await $fetch(`/api/my/problems/${problem.id}/publication`, { method: 'PUT', body: { version: problem.version, publish: true } })
    await navigateTo(`/problems/${problem.id}`)
  } catch (error) { message.value = accountError(error) }
  finally { busy.value = false }
}
</script>
<template>
  <div class="catalogue">
    <h1>問題を投稿</h1>
    <p>自分の未公開の問題を選んで投稿します。コンテストに登録した問題は選べません。</p>
    <p v-if="loading" role="status">問題を読み込んでいます…</p>
    <p v-if="message" role="alert" class="editor-error">{{ message }}</p>
    <button v-if="message" class="editor-button" :disabled="loading || busy" @click="load">再読み込み</button>
    <form v-if="!loading && available.length" @submit.prevent="post">
      <div class="field"><label for="post-problem">投稿する問題</label><select id="post-problem" v-model="selected" required :disabled="busy"><option disabled value="">問題を選択してください</option><option v-for="problem in available" :key="problem.id" :value="problem.id">{{ problem.title.trim() || '無題の問題' }}</option></select></div>
      <p>保存済みの内容を公開します。投稿後は誰でも閲覧・提出できるようになります。</p>
      <button class="editor-button primary" :disabled="busy || !selected" :aria-busy="busy">{{ busy ? '投稿中…' : '投稿' }}</button>
    </form>
    <p v-else-if="!loading && !message">投稿できる未公開の問題はありません。<NuxtLink to="/problems/new?fresh=1">新規問題を作成</NuxtLink></p>
    <p><NuxtLink to="/problems">問題一覧に戻る</NuxtLink></p>
  </div>
</template>
