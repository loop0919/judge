<script setup lang="ts">
const canonical = new URL('/contests', useRuntimeConfig().public.siteUrl).href
const description = 'ShareOJ のプログラミングコンテスト一覧。開催予定・開催中・終了したコンテストを探して、問題やルールを確認できます。'
useSeoMeta({ title: 'コンテスト | ShareOJ', description, ogTitle: 'コンテスト | ShareOJ', ogDescription: description, ogUrl: canonical, ogType: 'website' })
useHead({ link: [{ rel: 'canonical', href: canonical }] })
useSharePreview({ type: 'website', title: 'コンテスト', path: '/contests', description })
</script>
<template><ContestList /></template>
