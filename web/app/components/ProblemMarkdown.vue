<script setup lang="ts">
import { renderProblemMarkdown } from '~/utils/problem-markdown'

const props = defineProps<{ source: string }>()
const html = computed(() => renderProblemMarkdown(props.source))
</script>

<template>
  <!-- Raw HTML is disabled by the parser. Only its escaped output and trusted KaTeX markup are inserted. -->
  <div class="markdown-body" v-html="html" />
</template>
