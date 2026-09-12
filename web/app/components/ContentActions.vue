<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
defineProps<{ title: string, editTo: RouteLocationRaw, viewTo: string, published: boolean }>()
</script>

<template>
  <div class="content-actions">
    <NuxtLink :to="editTo" class="editor-button" :aria-label="`${title}を編集`" title="編集">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m13 6 5 5" /></svg>
    </NuxtLink>
    <NuxtLink v-if="published" :to="viewTo" class="editor-button" :aria-label="`${title}を閲覧`" title="閲覧">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m8 4 12 8-12 8Z" /></svg>
    </NuxtLink>
    <span v-else title="公開すると閲覧できます">
      <button class="editor-button" disabled :aria-label="`${title}を閲覧（公開すると閲覧できます）`">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m8 4 12 8-12 8Z" /></svg>
      </button>
    </span>
  </div>
</template>

<style scoped>
.content-actions { display: flex; gap: 8px; }
.content-actions .editor-button { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 0; }
</style>
