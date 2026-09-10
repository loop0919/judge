<script setup lang="ts">
import { testCaseError, type TestCase } from '~/utils/problem-draft'
const cases = defineModel<TestCase[]>({ required: true })
defineProps<{ disabled: boolean }>()
const error = computed(() => testCaseError(cases.value))
function remove(index: number) {
  if (window.confirm(`ケース${index + 1}を削除しますか？`)) cases.value.splice(index, 1)
}
</script>

<template>
  <section class="test-case-editor" aria-labelledby="test-cases-title">
    <header>
      <h1 id="test-cases-title">テストケース</h1>
      <p>入力と期待出力を登録します。変更は自動保存され、「公開する／公開内容を更新」で採点に反映されます。</p>
      <p class="muted">入出力は問題の作成者だけが閲覧できます。最大100件、各入力・期待出力は64 KiB、全体で256 KiBまで。空の入出力も登録できます。</p>
    </header>
    <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
    <p v-if="!cases.length" class="muted">テストケースはまだありません。採点するには1件以上登録してください。</p>
    <fieldset v-for="(item, index) in cases" :key="index" :disabled="disabled" class="test-case">
      <legend>ケース{{ index + 1 }}</legend>
      <div class="case-fields">
        <div><label :for="`case-input-${index}`">入力 {{ index + 1 }}</label><textarea :id="`case-input-${index}`" v-model="item.input" rows="8" spellcheck="false" /></div>
        <div><label :for="`case-output-${index}`">期待出力 {{ index + 1 }}</label><textarea :id="`case-output-${index}`" v-model="item.output" rows="8" spellcheck="false" /></div>
      </div>
      <button type="button" class="editor-button" :aria-label="`ケース${index + 1}を削除`" @click="remove(index)">削除</button>
    </fieldset>
    <button type="button" class="editor-button primary" :disabled="disabled || cases.length >= 100" @click="cases.push({ input: '', output: '' })">テストケースを追加</button>
    <p class="muted">{{ cases.length }} / 100件</p>
  </section>
</template>

<style scoped>
.test-case-editor { overflow-y: auto; padding: 24px; min-height: 0; }
header { max-width: 60rem; }
.test-case { min-width: 0; max-width: 60rem; border: 1px solid var(--color-line); padding: 16px; margin-block: 24px; }
legend { padding-inline: 8px; font-weight: 600; }
.case-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-bottom: 12px; }
.case-fields > div { min-width: 0; }
label { display: block; margin-bottom: 8px; }
textarea { width: 100%; box-sizing: border-box; padding: 12px; resize: vertical; font-family: monospace; font-size: 14px; }
@media (max-width: 600px) { .case-fields { grid-template-columns: minmax(0, 1fr); } .test-case-editor { padding: 16px; } }
</style>
