<script setup lang="ts">
import { contestDate, contestStatus, type Contest, type Standing } from '~~/shared/types/contest'
import type { Submission } from '~~/shared/types/submission'
definePageMeta({ key: route => String(route.params.id) })
useResponseHeader('Cache-Control').value = 'no-store'
useResponseHeader('Vary').value = 'Cookie'
const route = useRoute()
const { user } = useAccount()
const base = `/api/contests/${encodeURIComponent(String(route.params.id))}`
const { data: contest, error, refresh } = await useFetch<Contest>(base)
if (error.value || !contest.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 502, statusMessage: 'コンテストを取得できませんでした', fatal: true })
useSeoMeta({ title: () => `${contest.value?.title} | ShareOJ` })
const { data: standings, error: standingsError, refresh: refreshStandings } = await useFetch<Standing[]>(`${base}/standings`)
const submissions = ref<{ items: Submission[], hasMore: boolean } | null>(null)
const submissionsError = ref('')
const offset = ref(0)
async function loadSubmissions() {
  if (contest.value?.status !== 'ended') return
  try { submissions.value = await $fetch<{ items: Submission[], hasMore: boolean }>(`${base}/submissions`, { query: { offset: offset.value } }); submissionsError.value = '' }
  catch { submissionsError.value = '提出一覧を取得できませんでした。' }
}
async function update() { await Promise.all([refresh(), refreshStandings()]); await loadSubmissions() }
watch(() => user.value?.id, () => { void refresh() })
watch(offset, () => { void loadSubmissions() })
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { void loadSubmissions(); timer = setInterval(() => { if (!document.hidden) void update() }, 15000) })
onBeforeUnmount(() => clearInterval(timer))
function duration(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
</script>
<template>
  <div v-if="contest" class="catalogue">
    <nav class="breadcrumb" aria-label="パンくずリスト"><NuxtLink to="/contests">コンテスト</NuxtLink><span>/</span><span>{{ contest.title }}</span></nav>
    <h1>{{ contest.title }}</h1>
    <p>{{ contestStatus[contest.status] }} · 作成者 {{ contest.author }}</p>
    <p>{{ contestDate(contest.startsAt) }} 〜 {{ contestDate(contest.endsAt) }}（日本時間）</p>
    <p>誤答ペナルティ {{ contest.penaltyMinutes }} 分 · 部分点なし</p>
    <NuxtLink v-if="contest.canEdit" class="editor-button" :to="`/my/contests/${contest.id}`">コンテストを編集</NuxtLink>
    <ProblemMarkdown v-if="contest.description" :source="contest.description" />
    <h2>問題</h2>
    <p v-if="contest.status === 'scheduled'" class="muted">問題は開始時刻に公開されます。事前に閲覧できるのは作成者と、その問題のテスターです。</p>
    <p v-if="contest.status === 'ended'">コンテストは終了しました。以降の提出は練習扱いです。</p>
    <ol class="contest-problems"><li v-for="p in contest.problems" :key="p.id"><NuxtLink :to="`/contests/${contest.id}/problems/${p.id}`">{{ p.title }}</NuxtLink><span>{{ p.points }} 点</span></li></ol>
    <h2>公式順位表</h2>
    <p v-if="user && !contest.official" class="muted">作成者・テスターとしての提出は公式順位の対象外です。</p>
    <p class="muted">同点の場合は、最後の得点獲得までの経過時間と誤答ペナルティの合計で比較します。正解した問題の初回正解前の誤答のみ加算し、コンパイルエラーは除外します。</p>
    <p class="muted">15秒ごとに更新。終了前に受け付けた提出は、終了後に判定されても反映されます。</p>
    <button class="editor-button" @click="update">今すぐ更新</button>
    <p v-if="standingsError" role="alert">順位表を取得できませんでした。</p>
    <p v-else-if="!standings?.length" class="muted">公式順位の対象となる提出はまだありません。</p>
    <div v-else class="content-table-scroll" role="region" aria-label="公式順位表" tabindex="0">
      <table class="content-table"><thead><tr><th scope="col">順位</th><th scope="col">ユーザー</th><th scope="col">得点</th><th scope="col">時間（分:秒）</th><th v-for="(p, i) in contest.problems" :key="p.id" scope="col"><NuxtLink :to="`/contests/${contest.id}/problems/${p.id}`">{{ i + 1 }}</NuxtLink></th></tr></thead>
        <tbody><tr v-for="row in standings" :key="row.handle"><td>{{ row.rank }}</td><th scope="row">{{ row.handle }}</th><td>{{ row.points }}</td><td>{{ duration(row.timeMs) }}</td><td v-for="p in contest.problems" :key="p.id"><template v-if="row.problems[p.id]"><strong v-if="row.problems[p.id]!.acceptedAt">{{ row.problems[p.id]!.points }} 点</strong><span v-else>未正解</span><small>誤答 {{ row.problems[p.id]!.wrong }}<template v-if="row.problems[p.id]!.pending"> · 判定待ち {{ row.problems[p.id]!.pending }}</template></small></template><span v-else>—</span></td></tr></tbody>
      </table>
    </div>
    <section v-if="contest.status === 'ended'">
      <h2>提出一覧</h2><p class="muted">終了後は提出コードを閲覧できます。練習提出も掲載します。</p>
      <p v-if="submissionsError" role="alert">{{ submissionsError }}</p>
      <div v-if="submissions" class="content-table-scroll" role="region" aria-label="提出一覧" tabindex="0"><table class="content-table"><thead><tr><th scope="col">問題</th><th scope="col">ユーザー</th><th scope="col">結果</th><th scope="col">提出日時（日本時間）</th></tr></thead><tbody><tr v-for="s in submissions.items" :key="s.id"><th scope="row"><NuxtLink :to="`/contests/${contest.id}/submissions/${s.id}`">{{ s.problemTitle }}</NuxtLink></th><td>{{ s.author }}</td><td><SubmissionStatus :item="s" /></td><td>{{ contestDate(s.createdAt) }}<span v-if="new Date(s.createdAt) >= new Date(contest.endsAt)"> · 練習</span></td></tr></tbody></table><ContentPagination :index="offset / 50" :has-next="submissions.hasMore" :loading="false" @move="direction => offset += direction * 50" /></div>
    </section>
  </div>
</template>
<style scoped>
h1 { overflow-wrap: anywhere; } h2 { margin-top: 40px; } .contest-problems { max-width: 52rem; padding-left: 24px; } .contest-problems li { padding: 12px 0; border-bottom: 1px solid var(--color-line); } .contest-problems span { margin-left: 24px; } small { display: block; color: var(--color-muted); } .content-table-scroll { margin-top: 20px; }
</style>
