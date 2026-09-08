<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div class="site-shell" :class="{ 'site-shell--editor': route.meta.editorLayout }">
    <a class="skip-link" href="#main">本文へ移動</a>
    <header v-if="!route.meta.editorLayout" class="site-header">
      <NuxtLink class="wordmark" to="/" aria-label="OpenOJ ホーム">Open<span>OJ</span></NuxtLink>
      <nav aria-label="メインナビゲーション">
        <NuxtLink to="/">公開問題</NuxtLink>
        <NuxtLink to="/problems/new?fresh=1">問題を作成</NuxtLink>
        <NuxtLink to="/my/problems">自分の問題</NuxtLink>
        <NuxtLink to="/blog">Blog</NuxtLink>
      </nav>
    </header>
    <main id="main" tabindex="-1"><slot /></main>
    <footer v-if="!route.meta.editorLayout" class="site-footer">
      <span class="wordmark">OpenOJ</span>
      <span>Open Online Judge</span>
    </footer>
  </div>
</template>
