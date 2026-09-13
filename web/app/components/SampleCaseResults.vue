<script setup lang="ts">
import type { Submission } from '../../shared/types/submission'

defineProps<{ interactive?: boolean, cases: NonNullable<NonNullable<Submission['result']>['cases']> }>()
const fields = { input: '入力', expectedOutput: '期待される出力', actualOutput: '実際の出力' } as const
</script>

<template>
  <div class="sample-cases">
    <section v-for="(item, index) in cases" :key="index" class="sample-case">
      <h4>{{ item.name }}: {{ item.verdict === 'SKIPPED' ? '未実行' : item.verdict }}</h4>
      <div v-if="interactive" class="interactive-log">
        <h5>ジャッジコードの診断</h5>
        <template v-if="item.checkerLog">
          <pre v-if="item.checkerLog.text">{{ item.checkerLog.text }}</pre>
          <p v-else class="muted">診断メッセージはありません。</p>
          <p v-if="item.checkerLog.truncated" class="muted">長いため、先頭部分のみ表示しています。</p>
        </template>
        <p v-else class="muted">このケースの診断は記録されていません。</p>
      </div>
      <dl v-else-if="item.sampleDetails">
        <div v-for="(label, field) in fields" :key="field">
          <dt>{{ label }}</dt>
          <dd>
            <pre v-if="item.sampleDetails[field].text !== ''">{{ item.sampleDetails[field].text }}</pre>
            <p v-else class="muted">（空）</p>
            <p v-if="item.sampleDetails[field].truncated" class="muted">長いため、先頭部分のみ表示しています。</p>
          </dd>
        </div>
      </dl>
      <p v-else class="muted">このケースの入出力は記録されていません。</p>
    </section>
  </div>
</template>

<style scoped>
.sample-cases { margin-top: 20px; }
.sample-case { padding-block: 16px; border-top: 1px solid var(--color-line); }
h4 { margin: 0 0 12px; font-size: .875rem; }
dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; }
h5 { margin: 0 0 6px; font-size: .8125rem; }
dt { margin-bottom: 6px; font-size: .8125rem; font-weight: 600; }
dd { margin: 0; }
pre { max-height: 240px; padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--font-code); }
p { margin: 0; font-size: .8125rem; }
@media (max-width: 640px) { dl { grid-template-columns: 1fr; } }
</style>
