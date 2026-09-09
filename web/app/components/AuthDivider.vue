<template>
  <div class="auth-divider" aria-label="または"><span aria-hidden="true">OR</span></div>
</template>

<style scoped>
.auth-divider { display: flex; align-items: center; gap: 1rem; margin-block: 1.5rem; color: var(--color-muted); font-size: .75rem; letter-spacing: .08em; }
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; border-top: 1px solid var(--color-line); }
</style>
