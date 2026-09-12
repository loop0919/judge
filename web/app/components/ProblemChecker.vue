<script setup lang="ts">
import type { ProblemDraft } from '~/utils/problem-draft'

const checker = defineModel<ProblemDraft['checker']>({ required: true })
defineProps<{ disabled: boolean, problemId: string, published: boolean, save: () => Promise<boolean> }>()
const { data: catalog } = useFetch('/api/runtimes')
const available = computed(() => catalog.value?.items ?? [])
const enabled = computed({
  get: () => checker.value !== null,
  set: value => { checker.value = value ? { runtime: available.value[0]?.id ?? 'cpp17', source: '' } : null },
})
const error = computed(() => checker.value && (!checker.value.source.trim() || new TextEncoder().encode(checker.value.source).length > 65536 || checker.value.source.includes('\0'))
  ? '公開・採点するには検証コードを1〜65,536バイトで、NUL文字を含めずに入力してください。' : '')
</script>

<template>
  <section class="checker-settings" aria-labelledby="checker-title">
    <h1 id="checker-title">判定方法</h1>
    <label for="judge-method">判定方法</label>
    <select id="judge-method" v-model="enabled" :disabled="disabled">
      <option :value="false">通常判定（空白区切りで比較）</option>
      <option :value="true">スペシャルジャッジ</option>
    </select>
    <template v-if="checker">
      <p>提出の出力を標準入力で読み、終了コード0で正解、0以外で不正解とします。assertも使用できます。</p>
      <p>引数は順に、入力・期待出力・提出ソース・スコアのファイルパスです。期待出力は空でも構いません。スコアファイルへの書き込みは採点に使いません。</p>
      <label for="checker-language">検証コードの言語</label>
      <select id="checker-language" v-model="checker.runtime" :disabled="disabled">
        <option v-if="!available.some(item => item.id === checker?.runtime)" :value="checker.runtime">{{ checker.runtime }}（現在利用できません）</option>
        <option v-for="item in available" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select>
      <p class="muted">コードは自動保存。64 KiBまで。検証は各ケース5秒・512 MiBで実行し、制限超過はJEになります。</p>
      <SourceCodeEditor v-model="checker.source" label="検証コード" :disabled="disabled" />
      <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
    </template>
    <p v-if="published">提出は公開中の設定で採点します。編集内容を採点へ反映するには、問題管理から公開内容を更新してください。</p>
    <p v-else>テストケースを登録して解答を提出すると、保存した下書きで採点できます。正解例と不正解例の両方を試してください。</p>
    <SubmissionForm v-if="problemId" :problem-id="problemId" :before-submit="save" :disabled="disabled || !!error" />
  </section>
</template>

<style scoped>
.checker-settings { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; }
.checker-settings h1 { font-size: 1.25rem; }
.checker-settings p { max-width: 1000px; font-size: .875rem; }
label { display: block; margin-block: 16px 8px; }
select { max-width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--color-line); border-radius: 4px; background: var(--color-paper); color: var(--color-ink); }
.checker-settings :deep(.source-code-editor) { max-width: 1000px; margin-block: 12px; }
@media (max-width: 600px) { .checker-settings { padding: 16px 12px; } }
</style>
