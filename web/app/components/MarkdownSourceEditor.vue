<script setup lang="ts">
import { basicSetup } from 'codemirror'
import { Compartment, EditorState, Prec, Transaction } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { defaultHighlightStyle, HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage, insertNewlineContinueMarkupCommand, deleteMarkupBackward } from '@codemirror/lang-markdown'

defineOptions({ inheritAttrs: false })
const source = defineModel<string>({ required: true })
const props = defineProps<{ id: string, labelId: string, disabled?: boolean, invalid?: boolean, describedby?: string }>()
const emit = defineEmits<{ blur: [] }>()
const container = ref<HTMLDivElement>()
const { settings, indentation } = useEditorSettings('markdown')
const indentConfig = new Compartment()
const editable = new Compartment()
let editor: EditorView | undefined
const themeExtension = useCodeMirrorTheme(() => editor)
const indentExtensions = () => [indentUnit.of(indentation.value), EditorState.tabSize.of(settings.value.width)]
const editing = () => [
  EditorState.readOnly.of(Boolean(props.disabled)),
  EditorView.editable.of(!props.disabled),
  EditorView.contentAttributes.of({
    id: props.id, 'aria-labelledby': props.labelId, 'aria-multiline': 'true',
    'aria-disabled': String(Boolean(props.disabled)), 'aria-invalid': String(Boolean(props.invalid)),
    ...(props.describedby ? { 'aria-describedby': props.describedby } : {}),
    spellcheck: 'false',
  }),
]

onMounted(() => {
  editor = new EditorView({
    parent: container.value,
    doc: source.value,
    extensions: [
      basicSetup,
      themeExtension(),
      markdown({ base: markdownLanguage, addKeymap: false }),
      Prec.high(keymap.of([
        { key: 'Enter', run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
        { key: 'Backspace', run: deleteMarkupBackward },
        indentWithTab,
      ])),
      syntaxHighlighting(HighlightStyle.define(defaultHighlightStyle.specs.map(style => ({
        ...style,
        ...(style.color ? { color: `light-dark(${style.color}, color-mix(in srgb, ${style.color} 35%, white))` } : {}),
      })))),
      indentConfig.of(indentExtensions()),
      editable.of(editing()),
      EditorView.lineWrapping,
      EditorState.transactionFilter.of(transaction =>
        transaction.docChanged && transaction.newDoc.length > 100_000 && transaction.newDoc.length > transaction.startState.doc.length ? [] : transaction),
      EditorView.updateListener.of(update => {
        if (update.docChanged) source.value = update.state.doc.toString()
      }),
      EditorView.domEventHandlers({ blur: () => { emit('blur') } }),
      EditorView.theme({
        '&': { height: '100%', color: 'var(--color-ink)', backgroundColor: 'var(--color-paper)' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': { overflow: 'auto', overscrollBehavior: 'contain', fontFamily: 'var(--font-code)', fontSize: '.875rem', lineHeight: '22px' },
        '.cm-content': { padding: '0', minHeight: '100%' },
        '.cm-line': { padding: '0 16px' },
        '.cm-gutters': { backgroundColor: 'var(--color-paper)', color: 'var(--color-muted)', borderRight: '1px solid var(--color-line)' },
        '.cm-lineNumbers .cm-gutterElement': { minWidth: '48px', paddingRight: '12px' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--color-accent-soft)' },
        '@media (max-width: 39.999rem)': { '.cm-scroller': { fontSize: '1rem' } },
      }),
    ],
  })
})
watch(() => [props.disabled, props.invalid, props.describedby], () => editor?.dispatch({ effects: editable.reconfigure(editing()) }))
watch(() => [settings.value.style, settings.value.width], () => editor?.dispatch({ effects: indentConfig.reconfigure(indentExtensions()) }))
watch(source, value => {
  if (editor && value !== editor.state.doc.toString()) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, annotations: Transaction.addToHistory.of(false), filter: false })
  }
})
onBeforeUnmount(() => editor?.destroy())

function insertSnippet(snippet: string) {
  if (!editor || props.disabled) return
  editor.dispatch(editor.state.replaceSelection(snippet), { scrollIntoView: true, userEvent: 'input' })
  editor.focus()
}
defineExpose({ insertSnippet, requestMeasure: () => editor?.requestMeasure(), focus: () => editor?.focus() })
</script>

<template>
  <div ref="container" class="markdown-source-editor" />
</template>

<style scoped>
.markdown-source-editor { position: relative; flex: 1; min-height: 0; overflow: clip; }
.markdown-source-editor:focus-within::after { content: ''; position: absolute; inset: 0; z-index: 10; border: 2px solid var(--color-accent); pointer-events: none; }
</style>
