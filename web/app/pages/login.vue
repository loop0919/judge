<script setup lang="ts">
const { data: providers } = await useFetch<{ google: boolean }>('/api/auth/providers')
useSeoMeta({ title: 'ログイン | OpenOJ', robots: 'noindex, nofollow' })
const route = useRoute()
const { user } = useAccount()
const username = ref('')
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const challenge = ref<{ challengeName: string, session: string, challengeParameters: Record<string, string> } | null>(null)
const challengeKeys: Record<string, string> = { NEW_PASSWORD_REQUIRED: 'NEW_PASSWORD', SMS_MFA: 'SMS_MFA_CODE', SOFTWARE_TOKEN_MFA: 'SOFTWARE_TOKEN_MFA_CODE', EMAIL_OTP: 'EMAIL_OTP_CODE' }
const requiredAttributes = computed<string[]>(() => {
  try { return (JSON.parse(challenge.value?.challengeParameters.requiredAttributes ?? '[]') as string[]).map(s => s.replace(/^userAttributes\./, '')) }
  catch { return [] }
})
const attributes = reactive<Record<string, string>>({})
async function submit() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    let body: Record<string, unknown> = { username: username.value, password: password.value }
    if (challenge.value) {
      const key = challengeKeys[challenge.value.challengeName]
      if (!key) { error.value = 'この追加認証には未対応です。管理者にお問い合わせください。'; return }
      const responses: Record<string, string> = { [key]: code.value }
      for (const attr of requiredAttributes.value) responses[`userAttributes.${attr}`] = attributes[attr] ?? ''
      body = { username: challenge.value.challengeParameters.USER_ID_FOR_SRP || username.value, challenge_name: challenge.value.challengeName, session: challenge.value.session, responses }
    }
    const result = await $fetch<{ user?: { id: string }, challengeName?: string, session?: string, challengeParameters?: Record<string, string> }>(`/api/auth/${challenge.value ? 'challenge' : 'login'}`, { method: 'POST', body })
    password.value = ''; code.value = ''
    if (result.challengeName && result.session) {
      challenge.value = { challengeName: result.challengeName, session: result.session, challengeParameters: result.challengeParameters ?? {} }
      return
    }
    if (!result.user) throw new Error('Invalid response')
    user.value = result.user
    const next = typeof route.query.next === 'string' ? route.query.next : ''
    // Only local, known destinations can be used as a return path.
    await navigateTo(/^\/(my\/problems|problems\/new)(\?.*)?$/.test(next) ? next : '/my/problems')
  } catch {
    error.value = 'ログインできませんでした。入力内容と接続を確認して、もう一度お試しください。'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="account-login">
    <h1>ログイン</h1>
    <p v-if="providers?.google"><a class="editor-button" href="/auth/google">Googleでログイン</a></p>
    <p v-if="route.query.socialError" role="alert" class="editor-error">Googleでログインできませんでした。もう一度お試しください。</p>
    <p class="muted">問題をアカウントに保存して、別の端末でも編集できます。</p>
    <form @submit.prevent="submit">
      <template v-if="!challenge">
        <label for="login-email">メールアドレス</label>
        <input id="login-email" v-model="username" type="email" autocomplete="username" required :disabled="busy">
        <label for="login-password">パスワード</label>
        <input id="login-password" v-model="password" type="password" autocomplete="current-password" required :disabled="busy">
      </template>
      <template v-else>
        <label for="login-code">{{ challenge.challengeName === 'NEW_PASSWORD_REQUIRED' ? '新しいパスワード' : '確認コード' }}</label>
        <input id="login-code" v-model="code" :type="challenge.challengeName === 'NEW_PASSWORD_REQUIRED' ? 'password' : 'text'" :autocomplete="challenge.challengeName === 'NEW_PASSWORD_REQUIRED' ? 'new-password' : 'one-time-code'" required :disabled="busy">
        <template v-for="attr in requiredAttributes" :key="attr"><label :for="`attr-${attr}`">{{ attr }}</label><input :id="`attr-${attr}`" v-model="attributes[attr]" required :disabled="busy"></template>
        <button type="button" class="editor-button" :disabled="busy" @click="challenge = null; code = ''">ログインをやり直す</button>
      </template>
      <p v-if="error" role="alert" class="editor-error">{{ error }}</p>
      <button class="editor-button primary" type="submit" :disabled="busy">{{ busy ? '確認中…' : challenge ? '認証を続ける' : 'ログイン' }}</button>
    </form>
    <p>アカウントをお持ちでない方は、<NuxtLink to="/signup">アカウントを作成</NuxtLink>してください。</p>
    <p><NuxtLink to="/signup?confirm=1">メールアドレスの確認を続ける</NuxtLink></p>
  </section>
</template>

<style scoped>
.account-login { max-width: 28rem; margin: 4rem auto; padding: 0 1rem; }
form { display: grid; gap: .8rem; margin-top: 2rem; }
input { min-height: 2.75rem; padding: .5rem; border: 1px solid #aaa; border-radius: .25rem; font: inherit; }
</style>
