<template>
  <div class="site-shell">
    <a class="skip-link" href="#main">本文へ移動</a>
    <header class="site-header">
      <NuxtLink class="wordmark" to="/" aria-label="OpenOJ ホーム">Open<span>OJ</span></NuxtLink>
      <nav aria-label="メインナビゲーション">
        <NuxtLink to="/">公開問題</NuxtLink>
      </nav>
    </header>
    <main id="main" tabindex="-1"><slot /></main>
    <footer class="site-footer">
      <span class="wordmark">OpenOJ</span>
      <span>Open Online Judge</span>
    </footer>
  </div>
</template>
