<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const { settings, saveSettings } = useEditorSettings()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
</script>

<template>
  <button class="editor-button settings-button" type="button" aria-label="エディタ設定" title="エディタ設定" :disabled="disabled" @click="dialog?.showModal()">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z" /><circle cx="12" cy="12" r="3" /></svg>
  </button>
  <Teleport to="body">
    <dialog ref="dialog" class="editor-settings-dialog" :aria-labelledby="titleId">
      <h2 :id="titleId">エディタ設定</h2>
      <label>インデント方式
        <select v-model="settings.style" @change="saveSettings"><option value="space">space（スペース）</option><option value="tab">tab（タブ）</option></select>
      </label>
      <label>インデント幅
        <select v-model="settings.width" @change="saveSettings"><option v-for="width in 8" :key="width" :value="width">{{ width }}</option></select>
      </label>
      <p>両方のエディタに適用され、このブラウザに保存されます。tabの場合、幅はタブの表示幅です。入力済みの文字は変換しません。</p>
      <p>Tabでインデント、Shift+Tabで解除します。エディタからフォーカスを移すには、Escapeを押してからTabを押してください。</p>
      <form method="dialog"><button class="editor-button" autofocus>閉じる</button></form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.settings-button { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 5px; }
.settings-button svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
.editor-settings-dialog { width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; padding: 24px; border: 1px solid var(--color-line); border-radius: 8px; color: var(--color-ink); background: var(--color-paper); }
.editor-settings-dialog::backdrop { background: var(--color-dialog-backdrop); }
h2 { margin: 0 0 20px; font-size: 1.125rem; }
label { display: grid; gap: 8px; margin-block: 16px; font-size: .875rem; }
select { width: 100%; padding: 8px; border: 1px solid var(--color-line); border-radius: 4px; color: var(--color-ink); background: var(--color-paper); font: inherit; }
select:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
p { font-size: .8125rem; color: var(--color-muted); }
form { display: flex; justify-content: flex-end; margin-top: 24px; }
</style>
