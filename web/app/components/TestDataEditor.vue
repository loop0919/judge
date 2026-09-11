<script setup lang="ts">
import { testFileLimit } from '~/utils/problem-draft'
const text = defineModel<string>({ required: true })
const props = defineProps<{ id: string, label: string, disabled: boolean, storedBytes?: number, loading?: boolean, error?: string }>()
const field = ref<HTMLTextAreaElement>()
const file = ref<HTMLInputElement>()
const fileError = ref('')
const scrollTop = ref(0)
const height = ref(320)
const lineHeight = 22
const lineCount = computed(() => {
  let count = 1
  for (let i = 0; i < text.value.length; i++) if (text.value.charCodeAt(i) === 10) count++
  return count
})
const firstLine = computed(() => Math.max(0, Math.floor(scrollTop.value / lineHeight)))
const visibleLines = computed(() => Array.from({ length: Math.max(0, Math.min(lineCount.value - firstLine.value, Math.ceil(height.value / lineHeight) + 2)) }, (_, i) => firstLine.value + i + 1))
const bytes = computed(() => text.value ? new TextEncoder().encode(text.value).length : (props.storedBytes ?? 0))
function syncScroll() { if (field.value) scrollTop.value = field.value.scrollTop }
async function selectFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  fileError.value = ''
  try {
    if (selected.size > testFileLimit) throw new Error('16 MiBを超えるファイルは選択できません。')
    const value = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer())
    if (value.includes('\0')) throw new Error('NUL文字を含むファイルは選択できません。')
    text.value = value
  } catch (error) {
    fileError.value = error instanceof TypeError ? 'UTF-8のテキストファイルを選択してください。' : (error as Error).message
  } finally {
    if (file.value) file.value.value = ''
  }
}
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => { if (field.value) height.value = field.value.clientHeight })
  if (field.value) observer.observe(field.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(text, () => nextTick(syncScroll))
</script>

<template>
  <div class="test-data-editor">
    <div class="pane-heading"><label :for="id">{{ label }}</label><span>{{ bytes.toLocaleString('en-US') }} / 16,777,216 bytes</span><button type="button" class="editor-button" :disabled="disabled || loading" @click="file?.click()">ファイルを選択</button><input ref="file" class="visually-hidden" type="file" accept=".txt,text/plain" :disabled="disabled || loading" @change="selectFile"></div>
    <p v-if="loading" class="file-status" role="status">読み込んでいます…</p>
    <p v-else-if="error || fileError" class="file-status field-error" role="alert">{{ error || fileError }}</p>
    <div class="code-surface">
      <div class="line-gutter" aria-hidden="true"><div :style="{ transform: `translateY(${firstLine * lineHeight - scrollTop}px)` }"><div v-for="line in visibleLines" :key="line">{{ line }}</div></div></div>
      <textarea :id="id" ref="field" v-model="text" :disabled="disabled" wrap="off" spellcheck="false" autocomplete="off" autocapitalize="off" @scroll="syncScroll" />
    </div>
  </div>
</template>

<style scoped>
.test-data-editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--color-line); }
.pane-heading { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--color-line); }
.pane-heading label { margin: 0; font-size: .875rem; }
.pane-heading span { margin-left: auto; font-size: .75rem; color: var(--color-muted); }
.pane-heading button { padding: 3px 7px; font-size: .6875rem; white-space: nowrap; }
.file-status { margin: 0; padding: 4px 12px; font-size: .75rem; border-bottom: 1px solid var(--color-line); }
.code-surface { position: relative; flex: 1; min-height: 0; }
.line-gutter { position: absolute; inset: 0 auto 0 0; width: 58px; overflow: hidden; border-right: 1px solid var(--color-line); color: var(--color-muted); user-select: none; pointer-events: none; text-align: right; }
.line-gutter > div > div { padding-right: 10px; height: 22px; }
.line-gutter, textarea { font-family: var(--font-code); font-size: 14px; line-height: 22px; }
textarea { display: block; margin-left: 59px; width: calc(100% - 59px); height: 100%; box-sizing: border-box; padding: 0 16px; border: 0; resize: none; background: transparent; color: inherit; tab-size: 2; overscroll-behavior: contain; }
textarea:focus-visible { outline-offset: -2px; }
</style>
