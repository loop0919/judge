<script setup lang="ts">
defineProps<{ level: number | null }>()
</script>
<template>
  <span v-if="level" class="difficulty" :data-level="level"><svg v-if="level === 10" class="difficulty-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l5 4 4-7 4 7 5-4-2 12H5Z" /><path d="M5 21h14" /></svg><span v-else class="difficulty-dot" aria-hidden="true" />Lv.{{ level }}</span>
  <span v-else class="muted">未設定</span>
</template>
<style scoped>
/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V4 · existing ShareOJ tokens */
.difficulty { --grade-black: #192431; --grade-gray: #808080; --grade-brown: #9a6324; --grade-green: #18794e; --grade-cyan: #00b8d4; --grade-blue: #2463d4; --grade-yellow: #e6c700; --grade-orange: #ed8617; --grade-red: #d83232; --grade-gold: #c49a23; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.difficulty-dot { width: .75rem; height: .75rem; border-radius: 50%; background: var(--grade); border: 1px solid var(--color-muted); }
.difficulty-crown { width: 1rem; height: 1rem; fill: var(--grade); stroke: var(--grade); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
[data-level="1"] { --grade: var(--grade-black); }
[data-level="2"] { --grade: var(--grade-gray); }
[data-level="3"] { --grade: var(--grade-brown); }
[data-level="4"] { --grade: var(--grade-green); }
[data-level="5"] { --grade: var(--grade-cyan); }
[data-level="6"] { --grade: var(--grade-blue); }
[data-level="7"] { --grade: var(--grade-yellow); }
[data-level="8"] { --grade: var(--grade-orange); }
[data-level="9"] { --grade: var(--grade-red); }
[data-level="10"] { --grade: var(--grade-gold); }
</style>
