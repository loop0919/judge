<script setup lang="ts">
import { accountListSchema, accountError, type AccountSummary } from '~/utils/account-problems'
const { user, refreshAccount } = useAccount()
const accountEntries = ref<AccountSummary[]>([])
const accountLoading = ref(true)
const accountMessage = ref('')
const nextCursor = ref('')
let listedOwner = ''
async function loadAccount(more = false) {
  accountLoading.value = true
  accountMessage.value = ''
  try {
    const account = await refreshAccount()
    if (!account) { accountEntries.value = []; nextCursor.value = ''; await navigateTo('/login?next=/my/problems', { replace: true }); return }
    if (listedOwner !== account.id) { more = false; accountEntries.value = []; nextCursor.value = ''; listedOwner = account.id }
    const result = accountListSchema.parse(await $fetch('/api/my/problems', { query: more ? { cursor: nextCursor.value } : {} }))
    accountEntries.value = more ? [...accountEntries.value, ...result.items] : result.items
    nextCursor.value = result.nextCursor
  } catch (error) { accountMessage.value = accountError(error) }
  finally { accountLoading.value = false }
}

const updatedLabel = (date: string) => new Date(date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
onMounted(() => { void loadAccount() })
</script>

<template>
  <section class="draft-library">
    <header class="draft-library-heading">
      <div><h2>作成した問題</h2></div>
      <NuxtLink class="editor-button primary" to="/problems/new?fresh=1">新しい問題を作成</NuxtLink>
    </header>
    <p v-if="accountMessage" role="alert" class="editor-error">{{ accountMessage }}</p>
    <p v-if="accountLoading" role="status">問題を読み込んでいます…</p>
    <p v-else-if="!user"><NuxtLink to="/login?next=/my/problems">ログイン</NuxtLink>すると、問題を表示できます。</p>
    <template v-else>
      <p v-if="!accountEntries.length && !accountMessage">保存した問題はまだありません。</p>
      <ul class="draft-list">
        <li v-for="entry in accountEntries" :key="entry.id">
          <NuxtLink :to="{ path: '/problems/new', query: { problem: entry.id } }">
            <span class="draft-list-title">{{ entry.title.trim() || '無題の問題' }}</span>
            <span class="draft-list-meta"><span>{{ entry.publishedVersion ? '公開中' : '非公開' }}</span><time :datetime="entry.updatedAt">更新 {{ updatedLabel(entry.updatedAt) }}</time><span aria-hidden="true">→</span></span>
          </NuxtLink>
        </li>
      </ul>
      <button v-if="nextCursor" class="editor-button" :disabled="accountLoading" @click="loadAccount(true)">さらに読み込む</button>
    </template>
    <button v-if="accountMessage" class="editor-button" :disabled="accountLoading" @click="loadAccount()">再試行</button>
  </section>
</template>
