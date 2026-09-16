<script setup lang="ts">
const { preference } = useTheme()
</script>

<template>
  <label class="theme-select">配色
    <select v-model="preference" aria-label="配色">
      <option value="light">ライト</option>
      <option value="dark">ダーク</option>
      <option value="system">システム</option>
    </select>
  </label>
</template>

<style scoped>
.theme-select { display: inline-flex; align-items: center; gap: 6px; font-size: .8125rem; color: var(--color-muted); }
.theme-select select { min-height: 44px; max-width: 100%; padding: 4px 8px; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-paper); color: var(--color-ink); font: inherit; }
.theme-select select:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
</style>
