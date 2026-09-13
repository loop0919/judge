<script setup lang="ts">
import { loginDestination } from '~~/shared/utils/login-destination'
const route = useRoute()
const href = computed(() => route.query.next ? `/auth/google?${new URLSearchParams({ next: loginDestination(route.query.next) })}` : '/auth/google')
</script>
<template>
  <a class="google-login-link" :href="href">
    <img src="/images/google-g.png" width="20" height="20" alt="" aria-hidden="true">
    <span><slot>Googleでログイン</slot></span>
  </a>
</template>

<style scoped>
.google-login-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #747775;
  border-radius: 4px;
  background: #fff;
  color: #1f1f1f;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.google-login-link img { flex: 0 0 20px; }
.google-login-link:hover { background: #f8fafd; }
.google-login-link:focus-visible { outline: 2px solid #1a73e8; outline-offset: 3px; }
</style>
