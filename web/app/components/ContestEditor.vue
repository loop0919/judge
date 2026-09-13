<script setup lang="ts">
import { accountListSchema, type AccountSummary } from '~/utils/account-problems'
import type { Contest, ContestProblem } from '~~/shared/types/contest'
const props = defineProps<{ contestId?: string }>()
const ready = ref(false)
const busy = ref(false)
const message = ref('')
const title = ref('')
const description = ref('')
const startsAt = ref('')
const endsAt = ref('')
const penaltyMinutes = ref(5)
const version = ref(0)
const available = ref<AccountSummary[]>([])
const selected = ref<ContestProblem[]>([])
const id = ref(props.contestId ?? '')
const locked = ref(false)
const timezone = ref('')
function localDate(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
async function load() {
  try {
    if (props.contestId) {
      const c = await $fetch<Contest>(`/api/my/contests/${props.contestId}`)
      if (!c.canEdit) { locked.value = true; message.value = '開始後、または作成者以外は編集できません。'; return }
      title.value = c.title; description.value = c.description; startsAt.value = localDate(c.startsAt); endsAt.value = localDate(c.endsAt)
      penaltyMinutes.value = c.penaltyMinutes; version.value = c.version; selected.value = c.problems
    } else id.value = crypto.randomUUID()
    let cursor = ''
    do {
      const page = accountListSchema.parse(await $fetch('/api/my/problems', { query: { cursor } }))
      available.value.push(...page.items.filter(p => !p.publishedVersion && (!p.contestId || p.contestId === id.value)))
      cursor = page.nextCursor
    } while (cursor)
    ready.value = true
  } catch { message.value = '作成情報を読み込めませんでした。ログイン状態を確認して再読み込みしてください。' }
}
onMounted(() => { timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone; void load() })
function choose(p: AccountSummary, checked: boolean) {
  if (checked) selected.value.push({ id: p.id, title: p.title, points: 100 })
  else selected.value = selected.value.filter(item => item.id !== p.id)
}
function move(index: number, delta: number) {
  const item = selected.value.splice(index, 1)[0]
  if (item) selected.value.splice(index + delta, 0, item)
}
async function save() {
  if (busy.value || !ready.value) return
  const start = new Date(startsAt.value), end = new Date(endsAt.value)
  if (!selected.value.length || selected.value.length > 100 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() <= Date.now() || end <= start) {
    message.value = '問題を1〜100問選び、未来の開始日時と、それより後の終了日時を指定してください。'; return
  }
  busy.value = true; message.value = ''
  try {
    await $fetch(`/api/my/contests/${id.value}`, { method: 'PUT', body: { title: title.value, description: description.value, startsAt: start.toISOString(), endsAt: end.toISOString(), penaltyMinutes: penaltyMinutes.value, version: version.value, problems: selected.value.map(({ id, points }) => ({ id, points })) } })
    await navigateTo(`/contests/${id.value}`)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    message.value = status === 409 ? '保存できませんでした。問題の公開状態・他コンテストへの登録・テストケースを確認してください。開催開始や別画面での更新があった場合は再読み込みが必要です。' : status === 400 ? '入力内容を確認してください。' : '保存を確認できませんでした。作成したコンテスト一覧を確認してから再度お試しください。'
  } finally { busy.value = false }
}
</script>
<template>
  <section class="catalogue contest-editor">
    <NuxtLink to="/my/contests">作成したコンテストへ</NuxtLink>
    <h1>{{ contestId ? 'コンテスト編集' : 'コンテスト作成' }}</h1>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="!ready && !message" role="status">読み込み中…</p>
    <form v-if="ready && !locked" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label for="contest-title">コンテスト名</label><input id="contest-title" v-model="title" required maxlength="120">
        <label for="contest-description">説明（Markdown）</label><textarea id="contest-description" v-model="description" rows="6" maxlength="100000" />
        <p class="muted">日時の入力は {{ timezone }}。コンテストページでは日本時間で表示します。</p>
        <div class="dates"><div><label for="contest-start">開始日時</label><input id="contest-start" v-model="startsAt" type="datetime-local" required></div><div><label for="contest-end">終了日時</label><input id="contest-end" v-model="endsAt" type="datetime-local" required></div></div>
        <label for="contest-penalty">誤答ペナルティ（分）</label><input id="contest-penalty" v-model.number="penaltyMinutes" type="number" required min="0" max="1440" step="1">
        <h2>自分の未公開問題から選択</h2>
        <p class="muted">テストケースが必要です。他のコンテストに登録済みの問題は選べません。</p>
        <p v-if="!available.length"><NuxtLink to="/problems/new?fresh=1">問題を作成・保存</NuxtLink>してから、この画面を再読み込みしてください。</p>
        <div class="problem-picker"><label v-for="p in available" :key="p.id"><input type="checkbox" :checked="selected.some(item => item.id === p.id)" @change="choose(p, ($event.target as HTMLInputElement).checked)">{{ p.title || '無題の問題' }}</label></div>
        <h2>出題順・配点</h2>
        <ol class="selected"><li v-for="(p, index) in selected" :key="p.id"><span>{{ p.title }}</span><label :for="`points-${p.id}`">配点</label><input :id="`points-${p.id}`" v-model.number="p.points" type="number" min="1" max="1000000" step="1" required><button class="editor-button" type="button" :disabled="index === 0" :aria-label="`${p.title}を上へ`" @click="move(index, -1)">↑</button><button class="editor-button" type="button" :disabled="index === selected.length - 1" :aria-label="`${p.title}を下へ`" @click="move(index, 1)">↓</button></li></ol>
        <p>保存時点の問題内容で出題・採点します。問題を修正した場合は、開始前にコンテストも再保存してください。</p>
        <p>開始後は問題セット・配点・ペナルティ・開催期間を変更できません。問題と解説は終了後に自動公開されます。</p>
        <button class="editor-button primary" type="submit" :disabled="!selected.length" :aria-busy="busy">{{ busy ? '保存中…' : contestId ? '変更を保存' : 'コンテストを作成' }}</button>
      </fieldset>
    </form>
  </section>
</template>
<style scoped>
.contest-editor { max-width: 52rem; } fieldset { border: 0; padding: 0; min-width: 0; } label { display: block; margin: 20px 0 8px; } input:not([type=checkbox]), textarea { width: 100%; min-height: 44px; padding: 10px; font: inherit; color: var(--color-ink); background: var(--color-paper); border: 1px solid var(--color-line); border-radius: 4px; } input[type=number] { max-width: 140px; } .dates { display: flex; flex-wrap: wrap; gap: 24px; } .dates > div { flex: 1; min-width: 220px; } .problem-picker { max-height: 320px; overflow: auto; border-block: 1px solid var(--color-line); padding: 12px; } .problem-picker label { display: flex; gap: 12px; align-items: center; min-height: 44px; margin: 0; } .selected { padding-left: 24px; } .selected li { padding: 12px 0; } .selected span { display: inline-block; min-width: 120px; margin-right: 12px; } .selected label { display: inline; margin-right: 8px; } .selected button { margin-left: 8px; min-height: 44px; } h2 { margin-top: 32px; } :disabled { opacity: .6; } input:focus-visible, textarea:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
</style>
