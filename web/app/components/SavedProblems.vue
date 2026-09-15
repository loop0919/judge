<script setup lang="ts">
import { accountListSchema, accountError, type AccountSummary } from '~/utils/account-problems'
const props = defineProps<{ testing?: boolean }>()
const heading = computed(() => props.testing ? 'テスト中の問題' : '自分の問題')
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
    if (!account) { accountEntries.value = []; nextCursor.value = ''; await navigateTo('/login?next=/my%3Ftab%3Dproblems', { replace: true }); return }
    if (listedOwner !== account.id) { more = false; accountEntries.value = []; nextCursor.value = ''; listedOwner = account.id }
    const result = accountListSchema.parse(await $fetch('/api/my/problems', { query: { ...(props.testing ? { role: 'tester' } : {}), ...(more ? { cursor: nextCursor.value } : {}) } }))
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
      <div><h2>{{ heading }}</h2></div>
      <NuxtLink v-if="!testing" class="editor-button primary" to="/problems/new?fresh=1">新規問題</NuxtLink>
    </header>
    <p v-if="accountMessage" role="alert" class="editor-error">{{ accountMessage }}</p>
    <p v-if="accountLoading" role="status">問題を読み込んでいます…</p>
    <p v-else-if="!user"><NuxtLink to="/login?next=/my%3Ftab%3Dproblems">ログイン</NuxtLink>すると、問題を表示できます。</p>
    <template v-else>
      <p v-if="!accountEntries.length && !accountMessage">{{ testing ? 'テスト中の問題はまだありません。テスターリンクから参加すると、ここに表示されます。' : '保存した問題はまだありません。' }}</p>
      <div v-if="accountEntries.length" class="content-table-scroll">
        <table class="content-table" :aria-label="heading">
          <thead><tr><th scope="col">タイトル</th><th scope="col">公開状態</th><th scope="col">更新日時</th><th scope="col">操作</th></tr></thead>
          <tbody><tr v-for="entry in accountEntries" :key="entry.id">
            <th scope="row">{{ entry.title.trim() || '無題の問題' }}</th>
            <td>{{ entry.publishedVersion ? '公開中' : '非公開' }}</td>
            <td><time :datetime="entry.updatedAt">{{ updatedLabel(entry.updatedAt) }}</time></td>
            <td><ContentActions :title="entry.title.trim() || '無題の問題'" :edit-to="{ path: '/problems/new', query: { problem: entry.id } }" :view-to="`/problems/${entry.id}`" :published="!!entry.publishedVersion" can-view /></td>
          </tr></tbody>
        </table>
      </div>
      <button v-if="nextCursor" class="editor-button" :disabled="accountLoading" @click="loadAccount(true)">さらに読み込む</button>
    </template>
    <button v-if="accountMessage" class="editor-button" :disabled="accountLoading" @click="loadAccount()">再試行</button>
  </section>
</template>
