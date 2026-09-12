<script setup lang="ts">
useSeoMeta({ title: 'マイページ | ShareOJ', robots: 'noindex, nofollow' })
const { profile, logout } = useAccount()
const activeContent = ref('problems')
const joined = computed(() => profile.value ? new Date(profile.value.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }) : '')
</script>
<template>
  <section v-if="profile" class="my-page">
    <header class="profile-header">
      <UserAvatar :handle="profile.handle" :avatar="profile.avatar" :size="88" />
      <div class="profile-identity"><p class="eyebrow">マイページ</p><h1>{{ profile.handle }}</h1><p class="muted">{{ joined }}に登録</p></div>
      <NuxtLink class="editor-button" to="/my/settings">プロフィールを編集</NuxtLink>
    </header>
    <nav class="content-menu" aria-label="作成したコンテンツ">
      <button :aria-pressed="activeContent === 'problems'" @click="activeContent = 'problems'">問題</button>
      <button :aria-pressed="activeContent === 'posts'" @click="activeContent = 'posts'">記事</button>
      <button :aria-pressed="activeContent === 'submissions'" @click="activeContent = 'submissions'">提出履歴</button>
    </nav>
    <SavedProblems v-show="activeContent === 'problems'" />
    <SavedPosts v-show="activeContent === 'posts'" />
    <SubmissionHistory v-if="activeContent === 'submissions'" embedded />
    <div class="account-actions"><button class="editor-button" @click="logout">ログアウト</button></div>
  </section>
</template>
<style scoped>
.content-menu { display: flex; gap: 24px; border-bottom: 1px solid var(--color-line); margin-top: 24px; }
.content-menu button { padding: 12px 8px; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--color-muted); font: inherit; cursor: pointer; text-decoration: none; }
.content-menu button[aria-pressed="true"] { border-bottom-color: currentColor; color: var(--color-ink); font-weight: 600; }
.account-actions { padding-block: 24px 40px; border-top: 1px solid var(--color-line); }
.my-page { margin-top: 40px; }
.profile-header { display: flex; align-items: center; gap: 24px; padding-bottom: 32px; border-bottom: 1px solid var(--color-line); }
.profile-identity { flex: 1; min-width: 0; }
.profile-identity h1 { font-size: 2rem; margin: 0 0 4px; }
.profile-identity p { margin: 0; }
.eyebrow { font-size: .8rem; color: var(--color-muted); }
@media(max-width: 600px) { .profile-header { flex-wrap: wrap; gap: 16px; } .profile-header > a { margin-left: auto; } }
</style>
