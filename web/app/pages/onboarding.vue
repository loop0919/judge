<script setup lang="ts">
useSeoMeta({ title: 'ユーザーIDを登録 | ShareOJ', robots: 'noindex, nofollow' })
const { user } = useAccount()
</script>
<template>
  <section class="profile-page">
    <h1>ユーザーIDを登録</h1>
    <p class="muted">ShareOJで使うユーザーIDを決めてください。</p>
    <ProfileForm v-if="user" :initial="null" onboarding />
  </section>
</template>
<style scoped>
.profile-page { max-width: 36rem; margin: 48px auto 80px; }
</style>
