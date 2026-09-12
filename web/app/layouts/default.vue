<script setup lang="ts">
const route = useRoute()
const { user, profile, refreshAccount, refreshProfile } = useAccount()
onMounted(() => { void refreshAccount().then(account => { if (account) return refreshProfile() }).catch(() => {}) })
</script>

<template>
  <div class="site-shell" :class="{ 'site-shell--editor': route.meta.editorLayout }">
    <a class="skip-link" href="#main">本文へ移動</a>
    <header v-if="!route.meta.editorLayout" class="site-header">
      <NuxtLink class="wordmark" to="/" aria-label="OpenOJ ホーム">Open<span>OJ</span><span class="wordmark-alpha">(α)</span></NuxtLink>
      <nav aria-label="メインナビゲーション">
        <NuxtLink to="/">ホーム</NuxtLink>
        <NuxtLink to="/problems">問題</NuxtLink>
        <NuxtLink to="/blog">ブログ</NuxtLink>
        <NuxtLink v-if="user" to="/my" class="account-nav" aria-label="マイページ" title="マイページ"><UserAvatar :handle="profile?.handle ?? ''" :avatar="profile?.avatar" :size="32" /></NuxtLink>
        <NuxtLink v-else to="/login">ログイン</NuxtLink>
      </nav>
    </header>
    <main id="main" tabindex="-1"><slot /></main>
    <footer v-if="!route.meta.editorLayout" class="site-footer">
      <span class="wordmark">OpenOJ<span class="wordmark-alpha">(α)</span></span>
      <span>Open Online Judge</span>
    </footer>
  </div>
</template>

<style scoped>
.account-nav { min-width: 44px; min-height: 44px; justify-content: center; }
</style>
