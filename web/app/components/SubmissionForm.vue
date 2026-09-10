<script setup lang="ts">
import type { Submission } from '../../shared/types/submission'

const props = defineProps<{ problemId: string }>()
const { user } = useAccount()
const source = ref('')
const runtime = ref('cpp17')
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
    const result = await $fetch<Submission>('/api/my/submissions', { method: 'POST', body: { problemId: props.problemId, runtime: runtime.value, source: source.value } })
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
  <section v-if="!user" class="submission-login" aria-labelledby="submission-login-title">
    <h2 id="submission-login-title">ログインして解答を提出</h2>
    <p>解答の提出や採点結果の確認には、ログインが必要です。</p>
    <NuxtLink class="editor-button primary" to="/login">ログインする</NuxtLink>
  </section>
  <section v-else class="submission-form" aria-labelledby="submission-title">
    <h2 id="submission-title">提出</h2>
    <p class="muted">ソースコードは64 KiBまで</p>
    <form @submit.prevent="submit">
      <label for="submission-language">言語</label>
      <select id="submission-language" v-model="runtime" :disabled="sending">
        <option value="cpp17">C++17</option>
      </select>
      <SourceCodeEditor v-model="source" :disabled="sending" />
      <p v-if="message" role="alert">{{ message }}</p>
      <div class="submission-actions">
        <button class="editor-button primary" type="submit" :disabled="sending || !source.trim()" :aria-busy="sending">{{ sending ? '提出中…' : '提出する' }}</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.submission-form { margin-top: 40px; }
.submission-login { margin-top: 40px; padding: 24px; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-surface); }
.submission-login h2 { margin-bottom: 8px; }
.submission-login p { color: var(--color-muted); font-size: .875rem; }
.submission-login a { display: inline-flex; align-items: center; min-height: 44px; padding: 10px 24px; font-weight: 600; text-decoration: none; }
label { display: block; margin-block: 20px 8px; }
select { width: 100%; max-width: 320px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-paper); color: var(--color-ink); font: inherit; cursor: pointer; }
select:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 3px; }
select:disabled, .submission-actions button:disabled { opacity: .5; cursor: not-allowed; }
.submission-actions button { min-height: 44px; padding: 10px 28px; font-weight: 600; }
.submission-actions button:disabled { transform: none; text-decoration: none; }
.submission-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; margin-top: 16px; }
</style>
