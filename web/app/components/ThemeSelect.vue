<script setup lang="ts">
const { preference, dark } = useTheme()
const label = computed(() => dark.value ? 'ライトモードに切り替え' : 'ダークモードに切り替え')
</script>

<template>
  <button class="theme-toggle" type="button" :aria-label="label" :title="label" @click="preference = dark ? 'light' : 'dark'">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-if="dark" d="M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z" />
      <template v-else>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--color-muted); cursor: pointer; }
.theme-toggle:hover { background: var(--color-surface); color: var(--color-ink); }
.theme-toggle:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
</style>
