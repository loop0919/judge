<script setup lang="ts">
defineProps<{ handle?: string }>()
const { profile } = useAccount()
</script>
<template>
  <NuxtLink v-if="handle" :to="profile?.handle === handle ? '/my' : `/users/${encodeURIComponent(handle)}`">{{ handle }}</NuxtLink>
  <span v-else>—</span>
</template>
