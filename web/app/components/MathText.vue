<script setup lang="ts">
import { renderMathText } from '~/utils/math-text'

const props = defineProps<{ text: string }>()
const parts = computed(() => renderMathText(props.text))
</script>

<template>
  <span class="math-text">
    <template v-for="(part, index) in parts" :key="index">
      <template v-if="part.kind === 'text'">{{ part.text }}</template>
      <!-- Only KaTeX output reaches v-html; prose and parse errors remain text. -->
      <span
        v-else
        class="math-expression"
        :class="{ 'math-expression--display': part.display }"
        v-html="part.html"
      />
    </template>
  </span>
</template>
