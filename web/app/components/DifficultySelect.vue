<script setup lang="ts">
const level = defineModel<number | null>({ required: true })
const props = defineProps<{ id: string, label: string, disabled: boolean }>()
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const opened = ref(false)
const active = ref(0)
async function show() {
  if (props.disabled) return
  active.value = level.value ?? 0
  opened.value = true
  await reveal()
}
async function reveal() {
  await nextTick()
  root.value?.querySelector(`#${props.id}-option-${active.value}`)?.scrollIntoView({ block: 'nearest' })
}
function choose(value: number) {
  level.value = value === 0 ? null : value
  opened.value = false
  trigger.value?.focus()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Tab' || event.key === 'Escape') {
    if (opened.value && event.key === 'Escape') event.preventDefault()
    opened.value = false
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    if (!opened.value) { void show(); return }
    active.value = event.key === 'Home' ? 0 : event.key === 'End' ? 10 : Math.max(0, Math.min(10, active.value + (event.key === 'ArrowDown' ? 1 : -1)))
    void reveal()
  } else if (opened.value && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    choose(active.value)
  }
}
function outside(event: MouseEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) opened.value = false
}
onMounted(() => document.addEventListener('click', outside))
onBeforeUnmount(() => document.removeEventListener('click', outside))
watch(() => props.disabled, value => { if (value) opened.value = false })
</script>
<template>
  <div ref="root" class="difficulty-select">
    <button :id="id" ref="trigger" type="button" role="combobox" :aria-label="label" aria-haspopup="listbox" :aria-expanded="opened" :aria-controls="`${id}-options`" :aria-activedescendant="opened ? `${id}-option-${active}` : undefined" :disabled="disabled" @click="opened ? opened = false : show()" @keydown="keydown">
      <DifficultyBadge :level="level" /><span aria-hidden="true">▾</span>
    </button>
    <div v-if="opened" :id="`${id}-options`" class="difficulty-options" role="listbox" :aria-label="label">
      <div v-for="value in 11" :id="`${id}-option-${value - 1}`" :key="value" role="option" :aria-selected="(level ?? 0) === value - 1" :class="{ active: active === value - 1 }" @mousedown.prevent @click="choose(value - 1)">
        <DifficultyBadge :level="value === 1 ? null : value - 1" />
      </div>
    </div>
  </div>
</template>
<style scoped>
.difficulty-select { position: relative; min-width: 0; }
.difficulty-select > button { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 36px; padding: 6px 8px; border: 1px solid var(--color-line); border-radius: 4px; font: inherit; font-size: .875rem; color: var(--color-ink); background: var(--color-paper); cursor: pointer; }
.difficulty-select > button:hover:not(:disabled) { border-color: var(--color-muted); }
.difficulty-select > button:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 3px; }
.difficulty-select > button:disabled { opacity: .5; cursor: not-allowed; }
.difficulty-options { position: absolute; top: calc(100% + 4px); inset-inline: 0; z-index: 30; max-height: min(22rem, 50dvh); overflow-y: auto; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-paper); padding: 4px; font-size: .875rem; }
.difficulty-options [role="option"] { display: flex; align-items: center; min-height: 36px; padding: 6px 8px; cursor: pointer; }
.difficulty-options [role="option"]:hover, .difficulty-options .active { background: var(--color-surface); }
.difficulty-options [aria-selected="true"] { background: var(--color-accent-soft); }
@media (pointer: coarse) { .difficulty-select > button, .difficulty-options [role="option"] { min-height: 44px; } }
</style>
