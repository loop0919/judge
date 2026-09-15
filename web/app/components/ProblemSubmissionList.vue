<script setup lang="ts">
import { contestDate } from '~~/shared/types/contest'
import type { Submission } from '~~/shared/types/submission'
import { runtimeLabel } from '~/utils/runtime-label'
const props = defineProps<{ problemId: string, contestId?: string, mine: boolean }>()
const { user } = useAccount()
const route = useRoute()
const title = computed(() => props.mine ? '自分の提出' : 'すべての提出')
const data = ref<{ items: Submission[], hasMore: boolean } | null>(null)
const offset = ref(0)
const loading = ref(false)
const message = ref('')
let disposed = false
let request = 0
async function load() {
  const current = ++request
  if (props.mine && !user.value) { data.value = null; loading.value = false; return }
  loading.value = true
  message.value = ''
  try {
    const base = props.contestId ? `/api/contests/${props.contestId}/problems/${props.problemId}` : `/api/problems/${props.problemId}`
    const result = await $fetch<{ items: Submission[], hasMore: boolean }>(`${base}/submissions`, { query: { mine: props.mine ? '1' : '0', offset: offset.value } })
    if (!disposed && current === request) data.value = result
  } catch { if (!disposed && current === request) message.value = '提出一覧を取得できませんでした。閲覧権限を確認し、再取得してください。' }
  finally { if (!disposed && current === request) loading.value = false }
}
function detail(item: Submission) {
  if (props.mine) return `/my/submissions/${item.id}?from=${props.contestId ? 'contest-problem' : 'problem'}`
  return props.contestId ? `/contests/${props.contestId}/submissions/${item.id}?from=problem` : `/problems/${props.problemId}/submissions/${item.id}`
}
watch(offset, load)
watch(() => user.value?.id, () => { data.value = null; offset.value = 0; void load() })
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { void load(); timer = setInterval(() => { if (!document.hidden && !loading.value) void load() }, 15000) })
onBeforeUnmount(() => { disposed = true; clearInterval(timer) })
</script>
<template>
  <section class="problem-submissions" :aria-label="title">
    <header class="submission-heading"><h2>{{ title }}</h2><button v-if="!mine || user" class="editor-button" :disabled="loading" @click="load">{{ loading ? '更新中…' : '更新' }}</button></header>
    <p v-if="mine && !user" class="notice"><NuxtLink :to="{ path: '/login', query: { next: route.fullPath } }">ログイン</NuxtLink>すると、この問題への自分の提出を確認できます。</p>
    <template v-else>
      <p v-if="message" class="notice notice-error" role="alert">{{ message }}</p>
      <p v-if="loading && !data" class="muted" role="status">読み込み中…</p>
      <template v-if="data">
        <p v-if="!data.items.length" class="muted">提出はまだありません。</p>
        <div v-else class="content-table-scroll" role="region" aria-label="提出一覧のスクロール領域" tabindex="0" :aria-busy="loading">
          <table class="content-table"><thead><tr><th scope="col">提出日時（日本時間）</th><th scope="col">ユーザー</th><th scope="col">言語</th><th scope="col">結果</th><th scope="col">詳細</th></tr></thead>
            <tbody><tr v-for="item in data.items" :key="item.id"><td><time :datetime="item.createdAt">{{ contestDate(item.createdAt) }}</time></td><td><UserLink :handle="item.author" /></td><td>{{ runtimeLabel(item.runtime) }}</td><td><SubmissionStatus :item="item" /></td><td><NuxtLink :to="detail(item)">詳細</NuxtLink></td></tr></tbody>
          </table>
        </div>
        <ContentPagination :index="offset / 50" :has-next="data.hasMore" :loading="loading" @move="direction => offset += direction * 50" />
      </template>
    </template>
  </section>
</template>
<style scoped>
.problem-submissions { padding-block: 32px 64px; }
.submission-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.submission-heading h2 { margin: 0; }
.submission-heading button { min-height: 40px; padding-inline: 16px; }
</style>
