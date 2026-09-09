<script setup lang="ts">
import { accountProblemSchema, accountError } from '~/utils/account-problems'
import { draftErrors, initialProblemMarkdown } from '~/utils/problem-draft'

import { readProblemCache, writeProblemCache, removeProblemCache } from '~/utils/problem-cache'

definePageMeta({ editorLayout: true })
const route = useRoute()
const router = useRouter()
const { user, refreshAccount } = useAccount()
const cloudId = ref('')
const cloudVersion = ref(0)
const saving = ref(false)
const publishing = ref(false)
const publishedVersion = ref(0)
const publicationError = ref('')
let cloudOwner = ''
let disposed = false
let inFlight: Promise<boolean> | undefined
const saveLocation = computed(() => publishedVersion.value ? '公開中' : '非公開')
function refreshOnFocus() { void refreshAccount().catch(() => {}) }
useSeoMeta({ title: '問題を作成 | OpenOJ', robots: 'noindex, nofollow' })
const draft = reactive({ title: '', markdown: initialProblemMarkdown, timeLimitMs: '2000', memoryLimitMb: '1024' })
const timeLimitOptions = Array.from({ length: 50 }, (_, index) => (index + 1) * 100)
const memoryLimitPresets = [64, 128, 256, 512, 1024]
// Keep in-range memory limits from older drafts selectable.
const memoryLimitOptions = computed(() => [...new Set([...memoryLimitPresets, Number(draft.memoryLimitMb)])].sort((a, b) => a - b))
const ready = ref(false)
const mode = ref<'edit' | 'split' | 'preview'>('split')
const workspace = ref<HTMLElement>()
const splitPercent = ref(50)
const resizing = ref(false)
let dragStartX = 0
let dragStartPercent = 50
function setSplit(value: number) {
  splitPercent.value = Math.min(70, Math.max(30, value))
}
function startResize(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary) return
  dragStartX = event.clientX
  dragStartPercent = splitPercent.value
  resizing.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}
function moveResize(event: PointerEvent) {
  if (!resizing.value || !workspace.value) return
  const width = workspace.value.getBoundingClientRect().width - 8
  if (width > 0) setSplit(dragStartPercent + (event.clientX - dragStartX) / width * 100)
}
function stopResize(event: PointerEvent) {
  resizing.value = false
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}
function resizeWithKeyboard(event: KeyboardEvent) {
  const values: Record<string, number> = { ArrowLeft: splitPercent.value - 2, ArrowRight: splitPercent.value + 2, Home: 30, End: 70, Enter: 50 }
  const value = values[event.key]
  if (value === undefined) return
  event.preventDefault()
  setSplit(value)
}
const status = ref('問題を読み込んでいます…')
const storageError = ref('')
const leaveDialog = ref<HTMLDialogElement>()
const leaveError = ref('')
const manageDialog = ref<HTMLDialogElement>()
const managing = ref(false)
const sidebarExpanded = ref(false)
const confirmingDelete = ref(false)
const deleteError = ref('')
let deleted = false
let resolveLeave: ((leave: boolean) => void) | undefined
const showErrors = ref(false)
const touched = reactive({ title: false, markdown: false })
const errors = computed(() => draftErrors(draft))
const editor = ref<HTMLTextAreaElement>()
const renderedSource = ref(draft.markdown)
const sourceLines = computed(() => draft.markdown.split('\n'))
const sourceScrollTop = ref(0)
const sourceWidth = ref(0)
let sourceObserver: ResizeObserver | undefined
function syncSource() {
  if (!editor.value) return
  sourceScrollTop.value = editor.value.scrollTop
  sourceWidth.value = editor.value.clientWidth
}
let saved = ''
let allowAutosave = true
let saveTimer: ReturnType<typeof setTimeout> | undefined
let previewTimer: ReturnType<typeof setTimeout> | undefined
const fingerprint = () => JSON.stringify(draft)

async function saveDraft(manual = false, updateLocation = true): Promise<boolean> {
  if (deleted || publishing.value || confirmingDelete.value || !ready.value || (!manual && !allowAutosave)) return false
  clearTimeout(saveTimer)
  if (inFlight) {
    if (!await inFlight) return false
    if (fingerprint() === saved) return true
    return saveDraft(manual, updateLocation)
  }
  const snapshot = fingerprint()
  const version = cloudVersion.value
  cloudId.value ||= crypto.randomUUID()
  const id = cloudId.value
  saving.value = true
  status.value = '保存しています…'
  inFlight = (async () => {
    try {
      const account = await refreshAccount()
      if (!account || account.id !== cloudOwner) throw { statusCode: 401 }
      let result
      try {
        result = accountProblemSchema.parse(await $fetch(`/api/my/problems/${id}`, { method: 'PUT', body: { version, draft: JSON.parse(snapshot) } }))
      } catch (error) {
        // A response can be lost after a successful commit. Recognize that exact write.
        const current = await $fetch(`/api/my/problems/${id}`).catch(() => null)
        const parsed = accountProblemSchema.safeParse(current)
        if (!parsed.success || parsed.data.version !== version + 1 || JSON.stringify(parsed.data.draft) !== snapshot) throw error
        result = parsed.data
      }
      if (result.id !== id) throw new Error('Mismatched problem')
      writeProblemCache(cloudOwner, result)
      cloudVersion.value = result.version
      publishedVersion.value = result.publishedVersion
      saved = snapshot
      allowAutosave = true
      storageError.value = ''
      // Reload must reopen this draft before we announce that saving is complete.
      if (updateLocation && route.query.problem !== id) await router.replace({ path: '/problems/new', query: { problem: id } })
      status.value = fingerprint() === saved ? '保存済み' : '未保存の変更があります'
      return true
    } catch (error) {
      allowAutosave = false
      status.value = '保存に失敗しました'
      storageError.value = accountError(error)
      return false
    } finally { saving.value = false }
  })()
  try { return await inFlight }
  finally { inFlight = undefined }
}

async function publishProblem(publish: boolean) {
  if (publishing.value || saving.value) return
  publicationError.value = ''
  if (publish && (!draft.title.trim() || !draft.markdown.trim())) { publicationError.value = '公開するにはタイトルと本文を入力してください。'; return }
  if (!await saveDraft(true)) return
  if (!window.confirm(publish ? '現在の内容を公開しますか？誰でも閲覧できるようになります。' : 'この問題を非公開に戻しますか？')) return
  clearTimeout(saveTimer)
  publishing.value = true
  try {
    const result = accountProblemSchema.parse(await $fetch(`/api/my/problems/${cloudId.value}/publication`, { method: 'PUT', body: { version: cloudVersion.value, publish } }))
    cloudVersion.value = result.version
    publishedVersion.value = result.publishedVersion
    writeProblemCache(cloudOwner, result)
    status.value = publish ? '公開しました' : '非公開に戻しました'
  } catch (error) { publicationError.value = accountError(error) }
  finally { publishing.value = false }
}

function saveWithShortcut(event: KeyboardEvent) {
  if (event.isComposing || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  if (event.repeat || resolveLeave || confirmingDelete.value) return
  saveDraft(true)
}

function flushBeforeLeave(event: BeforeUnloadEvent) {
  if (ready.value && fingerprint() !== saved) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(async () => {
  window.addEventListener('focus', refreshOnFocus)
  if (window.matchMedia('(max-width: 59.999rem)').matches) mode.value = 'edit'
  try { await refreshAccount() } catch { user.value = null }
  if (disposed) return
  if (!user.value) {
    await navigateTo({ path: '/login', query: { next: route.fullPath } }, { replace: true })
    return
  }
  cloudOwner = user.value.id
  if (typeof route.query.problem === 'string') {
    cloudId.value = route.query.problem
    try {
      if (!user.value) throw { statusCode: 401 }
      cloudOwner = user.value.id
      const cached = readProblemCache(cloudOwner, cloudId.value)
      if (cached) { Object.assign(draft, cached.draft); renderedSource.value = draft.markdown }
      const entry = accountProblemSchema.parse(await $fetch(`/api/my/problems/${encodeURIComponent(cloudId.value)}`))
      if (disposed) return
      if (entry.id !== cloudId.value) throw new Error('Mismatched problem')
      writeProblemCache(cloudOwner, entry)
      Object.assign(draft, entry.draft)
      cloudVersion.value = entry.version
      publishedVersion.value = entry.publishedVersion
      status.value = '保存済み'
    } catch (error) {
      removeProblemCache(cloudOwner, cloudId.value)
      Object.assign(draft, { title: '', markdown: initialProblemMarkdown, timeLimitMs: '2000', memoryLimitMb: '1024' })
      renderedSource.value = draft.markdown
      status.value = '問題を読み込めませんでした'
      storageError.value = accountError(error)
      return
    }
  } else {
    status.value = 'サンプルから書き始められます'
  }
  saved = fingerprint()
  renderedSource.value = draft.markdown
  // Flush restoration watchers before enabling automatic writes.
  nextTick(() => { ready.value = true })
  window.addEventListener('beforeunload', flushBeforeLeave)
  window.addEventListener('keydown', saveWithShortcut)
  sourceObserver = new ResizeObserver(syncSource)
  if (editor.value) sourceObserver.observe(editor.value)
  syncSource()
})

watch(draft, () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => { renderedSource.value = draft.markdown }, 150)
  if (!ready.value) return
  status.value = '未保存の変更があります'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveDraft(), 600)
})

onBeforeRouteLeave(() => {
  if (saving.value || publishing.value) return false
  if (!ready.value || fingerprint() === saved) return true
  if (resolveLeave) return false
  clearTimeout(saveTimer)
  leaveError.value = ''
  return new Promise<boolean>(resolve => {
    resolveLeave = resolve
    leaveDialog.value?.showModal()
  })
})
async function finishLeave(choice: 'stay' | 'discard' | 'save') {
  if (choice === 'save' && !await saveDraft(true, false)) {
    leaveError.value = '保存できませんでした。編集を続けるか、保存せずに移動してください。'
    return
  }
  leaveDialog.value?.close()
  const resolve = resolveLeave
  resolveLeave = undefined
  resolve?.(choice !== 'stay')
  if (choice === 'stay' && fingerprint() !== saved) saveTimer = setTimeout(() => saveDraft(), 600)
}
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('focus', refreshOnFocus)
  resolveLeave?.(false)
  resolveLeave = undefined
  sourceObserver?.disconnect()
  clearTimeout(saveTimer)
  clearTimeout(previewTimer)
  window.removeEventListener('beforeunload', flushBeforeLeave)
  window.removeEventListener('keydown', saveWithShortcut)
})

function openManagement() {
  managing.value = true
}
function openDeleteConfirmation() {
  clearTimeout(saveTimer)
  if (saving.value || publishing.value) return
  confirmingDelete.value = true
  deleteError.value = ''
  manageDialog.value?.showModal()
}
function closeDeleteConfirmation() {
  manageDialog.value?.close()
  confirmingDelete.value = false
  if (!deleted && fingerprint() !== saved) saveTimer = setTimeout(() => saveDraft(), 600)
}
async function removeProblem() {
  clearTimeout(saveTimer)
  try {
    if (cloudId.value && cloudVersion.value > 0) {
      await $fetch(`/api/my/problems/${cloudId.value}`, { method: 'DELETE', query: { version: cloudVersion.value } })
    }
    removeProblemCache(cloudOwner, cloudId.value)
    deleted = true
    saved = fingerprint()
    manageDialog.value?.close()
    await router.replace('/my/problems')
  } catch (error) {
    deleteError.value = accountError(error)
  }
}

async function insertSnippet(snippet: string) {
  if (mode.value === 'preview') mode.value = 'edit'
  await nextTick()
  const field = editor.value
  if (!field) return
  const start = field.selectionStart
  const end = field.selectionEnd
  const value = draft.markdown.slice(0, start) + snippet + draft.markdown.slice(end)
  if (value.length > 100_000) return
  draft.markdown = value
  await nextTick()
  field.focus()
  field.setSelectionRange(start + snippet.length, start + snippet.length)
}

const inputSnippet = '\n```input\n$N$\n$A_1 \\quad A_2 \\quad \\cdots \\quad A_N$\n```\n'
const mathSnippet = '\n```math\n\\sum_{i=1}^{N} A_i\n```\n'
</script>

<template>
  <div class="author-page">
    <dialog ref="leaveDialog" class="leave-dialog" aria-labelledby="leave-title" aria-describedby="leave-description" @cancel.prevent="finishLeave('stay')">
      <h2 id="leave-title">未保存の変更があります</h2>
      <p id="leave-description">変更を保存してから移動しますか？ 保存せずに移動すると、未保存の変更は失われます。</p>
      <p v-if="leaveError" role="alert" class="field-error">{{ leaveError }}</p>
      <div class="leave-dialog-actions">
        <button type="button" class="editor-button" autofocus @click="finishLeave('stay')">編集を続ける</button>
        <button type="button" class="editor-button" @click="finishLeave('discard')">保存せずに移動</button>
        <button type="button" class="editor-button primary" @click="finishLeave('save')">保存して移動</button>
      </div>
    </dialog>
    <dialog ref="manageDialog" class="leave-dialog" aria-labelledby="manage-title" @cancel.prevent="closeDeleteConfirmation">
      <h2 id="manage-title">この問題を削除しますか？</h2>
      <p class="manage-problem-title">{{ draft.title.trim() || '無題の問題' }}</p>
      <p>問題と、未保存の変更を削除します。この操作は取り消せません。</p>
      <p v-if="deleteError" role="alert" class="field-error">{{ deleteError }}</p>
      <div class="leave-dialog-actions">
        <button type="button" class="editor-button" autofocus @click="closeDeleteConfirmation">キャンセル</button>
        <button type="button" class="editor-button danger" @click="removeProblem">削除する</button>
      </div>
    </dialog>
    <header class="editor-topbar">
      <NuxtLink class="wordmark" to="/" aria-label="OpenOJ ホーム">Open<span>OJ</span></NuxtLink>
      <div v-show="!managing" class="editor-view-switch" aria-label="表示の切り替え">
        <button type="button" class="editor-button" :aria-pressed="mode === 'edit'" aria-label="編集" title="編集" @click="mode = 'edit'"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15Z" /></svg></button>
        <button type="button" class="editor-button split-button" :aria-pressed="mode === 'split'" aria-label="分割" title="分割" @click="mode = 'split'"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /></svg></button>
        <button type="button" class="editor-button" :aria-pressed="mode === 'preview'" aria-label="プレビュー" title="プレビュー" @click="mode = 'preview'"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></button>
      </div>
      <div class="author-actions">
        <div class="editor-save-actions">
        <button type="button" class="editor-button primary save-button" :disabled="!ready || saving || publishing" :aria-busy="saving" :aria-label="saving ? '保存中' : '保存'" title="保存（Ctrl+S / ⌘S）" aria-keyshortcuts="Control+s Meta+s" @click="saveDraft(true)">
          <span :class="{ 'save-label-hidden': saving }">保存</span>
          <span v-if="saving" class="save-spinner" aria-hidden="true" />
        </button>
        <NuxtLink v-if="!user" class="editor-button" to="/login" target="_blank" rel="noopener">ログイン</NuxtLink>
        </div>
      </div>
    </header>
    <div class="author-body" :data-sidebar-expanded="sidebarExpanded">
      <aside class="editor-sidebar" aria-label="問題作成サイドバー">
        <button type="button" class="editor-button editor-sidebar-toggle" :aria-expanded="sidebarExpanded" aria-controls="editor-section-nav" :aria-label="sidebarExpanded ? 'サイドバーを折りたたむ' : 'サイドバーを展開'" :title="sidebarExpanded ? 'サイドバーを折りたたむ' : 'サイドバーを展開'" @click="sidebarExpanded = !sidebarExpanded">
          <svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path :d="sidebarExpanded ? 'm15 9-3 3 3 3' : 'm13 9 3 3-3 3'" /></svg>
        </button>
        <nav id="editor-section-nav" class="editor-section-nav" aria-label="問題作成メニュー">
          <button type="button" class="editor-button editor-sidebar-item" :aria-current="!managing ? 'page' : undefined" aria-label="問題文" title="問題文" @click="managing = false"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h6" /></svg><span class="editor-sidebar-label">問題文</span></button>

          <button type="button" class="editor-button editor-sidebar-item" disabled aria-label="テストケース（準備中）" title="テストケース（準備中）"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 2 2 3-4m-5 9 2 2 3-4m-5 9 2 2 3-4M12 6h9M12 13h9M12 20h9" /></svg><span class="editor-sidebar-label">テストケース</span></button>
          <button type="button" class="editor-button editor-sidebar-item" disabled aria-label="解説（準備中）" title="解説（準備中）"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15" /></svg><span class="editor-sidebar-label">解説</span></button>
          <button type="button" class="editor-button editor-sidebar-item" :disabled="!ready || publishing" :aria-current="managing ? 'page' : undefined" aria-label="問題管理" title="問題管理" @click="openManagement"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 .6-2h4.8l.6 2 2 1.2 2.1-.5 2.4 4.2-1.5 1.5v2.3l1.5 1.5-2.4 4.2-2.1-.5-2 1.2-.6 2H9l-.6-2-2-1.2-2.1.5-2.4-4.2 1.5-1.5V9.4L1.9 7.9l2.4-4.2 2.1.5Z" transform="translate(0 1)" /><circle cx="12" cy="12" r="3" /></svg><span class="editor-sidebar-label">問題管理</span></button>
        </nav>
      </aside>
      <div class="editor-main">
    <div class="editor-notices">
      <p v-if="storageError" class="editor-error" role="alert">{{ storageError }}</p>
      <noscript><p class="editor-error">編集と保存には JavaScript を有効にしてください。</p></noscript>
    </div>
    <div v-show="!managing" class="author-edit-content">
    <div class="author-fields">
      <div class="title-field">
        <div class="field-heading"><label for="problem-title">問題のタイトル</label><span id="title-error" class="field-error inline-field-error" aria-live="polite">{{ showErrors || touched.title ? errors.title : '' }}</span></div>
        <input id="problem-title" v-model="draft.title" maxlength="120" placeholder="例：A + B" :disabled="!ready || publishing" :aria-invalid="(showErrors || touched.title) && !!errors.title" aria-describedby="title-error" @blur="touched.title = true">
      </div>
      <div>
        <div class="field-heading"><span class="limit-field-label" id="time-limit-label">実行時間制限 <span>ms</span></span></div>
        <LimitStepper id="time-limit" v-model="draft.timeLimitMs" :options="timeLimitOptions" :default-value="2000" :step="100" label="実行時間制限" labelledby="time-limit-label" :disabled="!ready || publishing" />
      </div>
      <div>
        <div class="field-heading"><span class="limit-field-label" id="memory-limit-label">メモリ制限 <span>MiB</span></span></div>
        <LimitStepper id="memory-limit" v-model="draft.memoryLimitMb" :options="memoryLimitOptions" :default-value="1024" label="メモリ制限" labelledby="memory-limit-label" :disabled="!ready || publishing" />
      </div>
    </div>
    <div ref="workspace" class="author-workspace" :class="{ 'is-resizing': resizing }" :data-mode="mode" :style="{ '--editor-left': `${splitPercent}fr`, '--editor-right': `${100 - splitPercent}fr` }">
      <section id="source-pane" class="source-pane" aria-label="Markdown 編集">
        <div class="pane-heading"><div class="source-heading-label"><label for="problem-source">本文 <span>(Markdown)</span></label><NuxtLink class="source-guide-link" to="/blog/markdown-guide" target="_blank" rel="noopener noreferrer" aria-label="Markdown・数式の書き方" title="Markdown・数式の書き方"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 16h.01" /></svg></NuxtLink><span id="source-error" class="field-error inline-field-error" aria-live="polite">{{ showErrors || touched.markdown ? errors.markdown : '' }}</span></div><span>{{ draft.markdown.length.toLocaleString('en-US') }} / 100,000</span></div>
        <div class="editor-toolbar" aria-label="記法を挿入">
          <button type="button" :disabled="!ready || publishing" @click="insertSnippet('\n## 見出し\n')" aria-label="見出し" title="見出し"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M19 5v14M5 12h14" /></svg></button>
          <button type="button" :disabled="!ready || publishing" @click="insertSnippet('**強調**')" aria-label="太字" title="太字"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path stroke-width="2.4" d="M6 12h7a4 4 0 0 1 0 8H6V4h6a4 4 0 0 1 0 8" /></svg></button>
          <button type="button" :disabled="!ready || publishing" @click="insertSnippet(inputSnippet)" aria-label="入力形式" title="入力形式"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m6 8 3 3-3 3M12 15h5" /></svg></button>
          <button type="button" :disabled="!ready || publishing" @click="insertSnippet(mathSnippet)" aria-label="数式" title="数式"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4H6l7 8-7 8h13" /></svg></button>
          <button type="button" :disabled="!ready || publishing" @click="insertSnippet('\n```text\n3 5\n```\n')" aria-label="コード" title="コード"><svg class="editor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16" /></svg></button>
        </div>
        <div class="numbered-source">
          <div class="source-line-mirror" aria-hidden="true" :style="{ width: `${sourceWidth}px`, transform: `translateY(${-sourceScrollTop}px)` }">
            <div v-for="(line, index) in sourceLines" :key="index" class="source-mirror-row"><span class="source-line-number">{{ index + 1 }}</span><span class="source-mirror-text">{{ line || '\u200b' }}</span></div>
          </div>
        <textarea id="problem-source" ref="editor" v-model="draft.markdown" maxlength="100000" spellcheck="false" :disabled="!ready || publishing" :aria-invalid="(showErrors || touched.markdown) && !!errors.markdown" aria-describedby="source-error" @scroll="syncSource" @input="syncSource" @blur="touched.markdown = true" />
        </div>
      </section>
      <div class="split-handle" role="separator" tabindex="0" aria-label="編集欄とプレビューの幅を調整" aria-orientation="vertical" aria-controls="source-pane preview-pane" :aria-valuenow="Math.round(splitPercent)" :aria-valuetext="`編集欄 ${Math.round(splitPercent)}%、プレビュー ${100 - Math.round(splitPercent)}%`" :aria-valuemin="30" :aria-valuemax="70" title="ドラッグで幅を調整・ダブルクリックで均等に戻す" @pointerdown="startResize" @pointermove="moveResize" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="resizing = false" @keydown="resizeWithKeyboard" @dblclick="setSplit(50)" />
      <section id="preview-pane" class="preview-pane" aria-label="問題のプレビュー">
        <div class="pane-heading"><h2>プレビュー</h2><span>表示を確認</span></div>
        <div class="preview-document">
          <p class="preview-title">{{ draft.title || '無題の問題' }}</p>
          <p class="preview-limits">実行時間 {{ draft.timeLimitMs || '—' }} ms ／ メモリ {{ draft.memoryLimitMb || '—' }} MiB</p>
          <ProblemMarkdown v-if="renderedSource.trim()" :source="renderedSource" />
          <p v-else class="muted">本文を書くと、ここにプレビューが表示されます。</p>
        </div>
      </section>
    </div>
    </div>
    <section v-if="managing" class="problem-management" aria-labelledby="management-title">
      <div class="management-content">
        <header><h1 id="management-title">問題管理</h1><p class="manage-problem-title">{{ draft.title.trim() || '無題の問題' }}</p><p class="muted">{{ saveLocation }}</p></header>
        <section class="management-row"><div><h2>公開設定</h2><p>公開内容は「公開内容を更新」を押すまで変わりません。</p><p v-if="publicationError" class="editor-error" role="alert">{{ publicationError }}</p><NuxtLink v-if="publishedVersion" :to="`/problems/${cloudId}`" target="_blank">公開ページを見る</NuxtLink></div><div class="publication-actions"><button class="editor-button primary" :disabled="saving || publishing" @click="publishProblem(true)">{{ publishedVersion ? '公開内容を更新' : '公開する' }}</button><button v-if="publishedVersion" class="editor-button" :disabled="saving || publishing" @click="publishProblem(false)">非公開に戻す</button></div></section>
        <section class="management-row"><div><h2>テスターリンク</h2><p>公開前の問題をテスターに共有します。</p></div><button type="button" class="editor-button" disabled>リンクを発行（準備中）</button></section>
        <section class="management-row"><div><h2>リジャッジ</h2><p>テストケースや採点設定の変更後に、提出を再採点します。</p></div><button type="button" class="editor-button" disabled>リジャッジ（準備中）</button></section>
        <section class="management-row"><div><h2>テストケースの一括削除</h2><p>この問題に登録したテストケースをまとめて削除します。</p></div><button type="button" class="editor-button" disabled>一括削除（準備中）</button></section>
        <section class="management-row"><div><h2>問題の削除</h2><p>問題を削除します。この操作は取り消せません。</p></div><button type="button" class="editor-button danger" @click="openDeleteConfirmation">問題を削除</button></section>
      </div>
    </section>
      </div>
    </div>
    <div class="draft-status"><span role="status">{{ status }}</span><span>{{ saveLocation }}</span></div>
  </div>
</template>

<style scoped>
.publication-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.save-button { position: relative; }
.save-label-hidden { visibility: hidden; }
.save-spinner {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 1rem;
  height: 1rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: save-spin .7s linear infinite;
}
@keyframes save-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .save-spinner { animation: none; }
}
</style>
