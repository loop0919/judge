<script setup lang="ts">
definePageMeta({ key: route => route.params.handle as string })
const route = useRoute()
const router = useRouter()
const handle = String(route.params.handle)
const { data: profile, error } = await useFetch(`/api/users/${encodeURIComponent(handle)}`)
if (error.value || !profile.value) throw createError({
  statusCode: error.value?.statusCode === 404 ? 404 : 502,
  statusMessage: error.value?.statusCode === 404 ? 'ユーザーが見つかりません' : 'ユーザー情報を取得できませんでした',
  fatal: true,
})
const activeContent = computed({
  get: () => route.query.tab === 'posts' ? 'posts' : 'problems',
  set: tab => { void router.replace({ query: { ...route.query, tab } }) },
})
const joined = computed(() => new Date(profile.value!.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' }))
useSeoMeta({ title: () => `${profile.value?.handle} | ShareOJ` })
</script>
<template>
  <section v-if="profile" class="my-page">
    <header class="profile-header">
      <UserAvatar :handle="profile.handle" :avatar="profile.avatar" :size="88" />
      <div class="profile-identity"><p class="eyebrow">ユーザーページ</p><h1>{{ profile.handle }}</h1><p class="muted">{{ joined }}に登録</p></div>
    </header>
    <ProfileAccounts :accounts="profile.accounts" />
    <nav class="content-menu" aria-label="公開コンテンツ">
      <button :aria-pressed="activeContent === 'problems'" @click="activeContent = 'problems'">問題</button>
      <button :aria-pressed="activeContent === 'posts'" @click="activeContent = 'posts'">記事</button>
    </nav>
    <PublicUserContent :key="`${handle}:${activeContent}`" :handle="handle" :kind="activeContent" />
  </section>
</template>
<style scoped src="../../assets/css/profile.css"></style>
