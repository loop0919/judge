import { Compartment } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export function useCodeMirrorTheme(getEditor: () => EditorView | undefined) {
  const { dark } = useTheme()
  const compartment = new Compartment()
  const theme = () => EditorView.theme({
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-ink)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'light-dark(#cce5d8, #375c49)' },
    '.cm-panels, .cm-tooltip': { backgroundColor: 'var(--color-surface)', color: 'var(--color-ink)', borderColor: 'var(--color-line)' },
    '.cm-searchMatch': { backgroundColor: 'light-dark(#ffe49c, #695124)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'light-dark(#ffd16a, #886322)' },
  }, { dark: dark.value })
  watch(dark, () => getEditor()?.dispatch({ effects: compartment.reconfigure(theme()) }))
  return () => compartment.of(theme())
}
