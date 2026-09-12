<script setup lang="ts">
useSeoMeta({ title: 'プロフィール設定 | ShareOJ', robots: 'noindex, nofollow' })
const { profile } = useAccount()
</script>
<template>
  <section class="profile-page">
    <NuxtLink to="/my">マイページへ戻る</NuxtLink>
    <h1>プロフィール設定</h1>
    <ProfileForm v-if="profile" :initial="profile" />
  </section>
</template>
<style scoped>
.profile-page { max-width: 36rem; margin: 48px auto 80px; }
</style>
