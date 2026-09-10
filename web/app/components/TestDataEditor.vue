<script setup lang="ts">
const text = defineModel<string>({ required: true })
defineProps<{ id: string, label: string, disabled: boolean }>()
const field = ref<HTMLTextAreaElement>()
const scrollTop = ref(0)
const height = ref(320)
const lineHeight = 26
const lineCount = computed(() => {
  let count = 1
  for (let i = 0; i < text.value.length; i++) if (text.value.charCodeAt(i) === 10) count++
  return count
})
const firstLine = computed(() => Math.max(0, Math.floor((scrollTop.value - 16) / lineHeight)))
const visibleLines = computed(() => Array.from({ length: Math.max(0, Math.min(lineCount.value - firstLine.value, Math.ceil(height.value / lineHeight) + 2)) }, (_, i) => firstLine.value + i + 1))
const bytes = computed(() => new TextEncoder().encode(text.value).length)
function syncScroll() { if (field.value) scrollTop.value = field.value.scrollTop }
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
    <div class="pane-heading"><label :for="id">{{ label }}</label><span>{{ bytes.toLocaleString('en-US') }} bytes</span></div>
    <div class="code-surface">
      <div class="line-gutter" aria-hidden="true"><div :style="{ transform: `translateY(${16 + firstLine * lineHeight - scrollTop}px)` }"><div v-for="line in visibleLines" :key="line">{{ line }}</div></div></div>
      <textarea :id="id" ref="field" v-model="text" :disabled="disabled" wrap="off" spellcheck="false" autocomplete="off" autocapitalize="off" @scroll="syncScroll" />
    </div>
  </div>
</template>

<style scoped>
.test-data-editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--color-line); }
.pane-heading { display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--color-line); }
.pane-heading label { margin: 0; font-size: .875rem; }
.pane-heading span { font-size: .75rem; color: var(--color-muted); }
.code-surface { position: relative; flex: 1; min-height: 0; }
.line-gutter { position: absolute; inset: 0 auto 0 0; width: 58px; overflow: hidden; border-right: 1px solid var(--color-line); color: var(--color-muted); user-select: none; pointer-events: none; text-align: right; }
.line-gutter > div > div { padding-right: 10px; height: 26px; }
.line-gutter, textarea { font-family: var(--font-code); font-size: 14px; line-height: 26px; }
textarea { display: block; margin-left: 59px; width: calc(100% - 59px); height: 100%; box-sizing: border-box; padding: 16px; border: 0; resize: none; background: transparent; color: inherit; tab-size: 2; overscroll-behavior: contain; }
textarea:focus-visible { outline-offset: -2px; }
</style>
