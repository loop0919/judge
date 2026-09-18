<script setup lang="ts">
const props = defineProps<{ items: { id: string, label: string }[], disabled?: boolean }>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ change: [] }>()
const id = useId()
const input = ref<HTMLInputElement>()
const list = ref<HTMLUListElement>()
const open = ref(false)
const query = ref<string | null>(null)
const active = ref(-1)
const selectedLabel = computed(() => props.items.find(item => item.id === model.value)?.label ?? '-- 未選択 --')
const options = computed(() => {
  const characters = [...(query.value ?? '').normalize('NFKC').toLowerCase().replace(/\s/g, '')]
  if (!characters.length) return [{ id: '', label: '-- 未選択 --' }, ...props.items]
  return props.items.filter(item => {
    const label = item.label.normalize('NFKC').toLowerCase()
    let position = 0
    return characters.every(character => {
      const index = label.indexOf(character, position)
      position = index + 1
      return index !== -1
    })
  })
})
function show() {
  if (props.disabled || open.value) return
  open.value = true
  active.value = options.value.findIndex(item => item.id === model.value)
  input.value?.select()
}
function close() {
  open.value = false
  query.value = null
  active.value = -1
}
function choose(index: number) {
  const item = options.value[index]
  if (!item || props.disabled) return
  model.value = item.id
  emit('change')
  close()
}
function search(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  open.value = true
  active.value = options.value.length ? 0 : -1
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter') event.preventDefault()
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'Enter') {
    if (open.value) choose(active.value)
    else show()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) show()
    else active.value = Math.max(0, Math.min(options.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1)))
  } else if (event.key === 'Tab') close()
}
watch([active, options, open], async () => {
  await nextTick()
  list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' })
})
watch(() => props.disabled, disabled => { if (disabled) close() })
</script>

<template>
  <div class="language-select">
    <label :for="id">言語</label>
    <div class="language-field">
      <input :id="id" ref="input" :value="query ?? selectedLabel" :disabled="disabled" role="combobox" autocomplete="off" spellcheck="false"
        aria-autocomplete="list" :aria-expanded="open" :aria-controls="`${id}-options`" :aria-activedescendant="open && options[active] ? `${id}-option-${active}` : undefined"
        @focus="show" @click="show" @input="search" @keydown="keydown" @blur="close">
      <button type="button" tabindex="-1" :disabled="disabled" :aria-label="open ? '言語の候補を閉じる' : '言語の候補を開く'" :aria-expanded="open" :aria-controls="`${id}-options`"
        @mousedown.prevent @click="open ? close() : (input?.focus(), show())"><span aria-hidden="true">⌄</span></button>
    </div>
    <div v-if="open" class="language-popup" @mousedown.prevent>
      <ul :id="`${id}-options`" ref="list" role="listbox" aria-label="言語の候補">
        <li v-for="(item, index) in options" :id="`${id}-option-${index}`" :key="item.id" role="option" :aria-selected="item.id === model" :class="{ active: index === active }" @click="choose(index)">{{ item.label }}</li>
      </ul>
      <p v-if="!options.length" role="status">一致する言語がありません。</p>
    </div>
  </div>
</template>

<style scoped>
.language-select { position: relative; width: 100%; max-width: 320px; }
label { display: block; margin-block: 20px 8px; }
.language-field { display: flex; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-paper); }
.language-field:focus-within { outline: 3px solid var(--color-accent); outline-offset: 3px; }
input { width: 100%; min-width: 0; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 4px; background: transparent; color: var(--color-ink); font: inherit; outline: none; }
button { flex: none; width: 36px; border: 0; background: transparent; color: var(--color-ink); font: inherit; cursor: pointer; }
input:disabled, button:disabled { opacity: .5; cursor: not-allowed; }
.language-popup { position: absolute; top: 100%; left: 0; width: 100%; z-index: 10; margin-top: 4px; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-paper); color: var(--color-ink); box-shadow: 0 4px 12px #0002; }
ul { max-height: 300px; overflow-y: auto; margin: 0; padding: 4px 0; list-style: none; }
li { padding: 8px 12px; cursor: pointer; overflow-wrap: anywhere; }
li.active, li:hover { background: var(--color-accent-soft); }
li[aria-selected="true"] { font-weight: 600; }
p { margin: 0; padding: 12px; color: var(--color-muted); }
</style>
