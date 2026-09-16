<script setup lang="ts">
const { preference } = useTheme()
const themes = [
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
  { value: 'system', label: 'システム' },
] as const
</script>

<template>
  <div class="theme-select" role="group" aria-label="配色">
    <button v-for="theme in themes" :key="theme.value" type="button" :aria-label="theme.label" :title="theme.label" :aria-pressed="preference === theme.value" @click="preference = theme.value">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="theme.value === 'light'">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </template>
        <path v-else-if="theme.value === 'dark'" d="M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z" />
        <template v-else>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M12 17v4m-4 0h8" />
        </template>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.theme-select { display: inline-flex; align-items: center; flex-shrink: 0; }
.theme-select button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--color-muted); cursor: pointer; }
.theme-select button:hover { background: var(--color-surface); color: var(--color-ink); }
.theme-select button[aria-pressed="true"] { background: var(--color-accent-soft); color: var(--color-accent); border-color: currentColor; }
.theme-select button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
</style>
