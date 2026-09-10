<script setup lang="ts">
import type { Submission } from '../../shared/types/submission'

const props = defineProps<{ problemId: string }>()
const source = ref('')
const sending = ref(false)
const message = ref('')
async function submit() {
  if (sending.value) return
  if (!source.value.trim() || new TextEncoder().encode(source.value).length > 65536) {
    message.value = 'ソースコードを1〜65,536バイトで入力してください。'
    return
  }
  sending.value = true
  message.value = ''
  try {
    const result = await $fetch<Submission>('/api/my/submissions', { method: 'POST', body: { problemId: props.problemId, runtime: 'cpp17-local', source: source.value } })
    await navigateTo(`/my/submissions/${result.id}`)
  } catch (error) {
    const failure = error as { statusCode?: number, data?: { data?: { code?: string } } }
    const code = failure.data?.data?.code
    if (failure.statusCode === 401) message.value = '提出するにはログインしてください。入力したコードはこの画面に残っています。'
    else if (code === 'profile_required') message.value = 'プロフィールを登録してから提出してください。'
    else if (code === 'tests_not_ready') message.value = 'この問題の現在の版には、採点用テストが登録されていません。'
    else if (code === 'judging_unavailable') message.value = 'ジャッジが設定されていません。'
    else message.value = '提出を確認できませんでした。再送する前に提出履歴を確認してください。'
  } finally { sending.value = false }
}
</script>

<template>
  <section class="submission-form" aria-labelledby="submission-title">
    <h2 id="submission-title">C++で提出</h2>
    <p class="muted">C++17（ローカル開発用）／ソースコードは64 KiBまで</p>
    <form @submit.prevent="submit">
      <label for="submission-source">ソースコード</label>
      <textarea id="submission-source" v-model="source" rows="16" spellcheck="false" autocapitalize="off" autocomplete="off" :disabled="sending" required />
      <p v-if="message" role="alert">{{ message }}</p>
      <div class="submission-actions">
        <button type="submit" :disabled="sending || !source.trim()">{{ sending ? '提出中…' : '提出する' }}</button>
        <NuxtLink to="/my/submissions">自分の提出履歴</NuxtLink>
        <NuxtLink to="/login">ログイン</NuxtLink>
      </div>
    </form>
  </section>
</template>

<style scoped>
.submission-form { margin-top: 40px; }
label { display: block; margin-block: 20px 8px; }
textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 12px; font-family: monospace; font-size: 14px; }
.submission-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; margin-top: 16px; }
</style>
