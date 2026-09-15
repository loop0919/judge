<script setup lang="ts">
defineProps<{ handle?: string }>()
</script>
<template>
  <NuxtLink v-if="handle" :to="`/users/${encodeURIComponent(handle)}`">{{ handle }}</NuxtLink>
  <span v-else>—</span>
</template>
