<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id) })
useSeoMeta({ title: 'コンテスト編集 | ShareOJ', robots: 'noindex, nofollow' })
</script>
<template><ContestEditor :contest-id="String($route.params.id)" /></template>
