<script setup lang="ts">
import type { Submission } from '../../shared/types/submission'

const { item } = defineProps<{ item: Submission }>()
const tooltipId = useId()
const pending = computed(() => item.status !== 'DONE')
const label = computed(() => {
  if (!pending.value) return item.result?.verdict ?? '完了'
  if (item.status === 'RUNNING' && item.progress?.phase === 'JUDGING') return `${item.progress.completed}/${item.progress.total}`
  return 'WJ'
})
</script>

<template>
  <span class="judge-status">
    <span class="verdict-badge" :data-verdict="item.result?.verdict" :tabindex="pending ? 0 : undefined" :aria-describedby="pending ? tooltipId : undefined">
      <span v-if="pending" class="judge-spinner" aria-hidden="true" />{{ label }}
    </span>
    <span v-if="pending" :id="tooltipId" class="judge-tooltip" role="tooltip">ジャッジ中</span>
  </span>
</template>

<style scoped>
.judge-status { position: relative; display: inline-flex; }
.verdict-badge { gap: 6px; }
.verdict-badge:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
.judge-spinner { width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: judge-spin .8s linear infinite; }
.judge-tooltip { display: none; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); padding: 4px 8px; border-radius: 4px; background: var(--color-ink); color: var(--color-paper); white-space: nowrap; font-size: .75rem; z-index: 1; }
.judge-status:hover .judge-tooltip, .judge-status:focus-within .judge-tooltip { display: block; }
@keyframes judge-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .judge-spinner { animation: none; } }
</style>
