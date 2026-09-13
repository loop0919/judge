import type { Ref } from 'vue'

export function useMarkdownEditor(markdown: Ref<string>) {
  const { settings, indentation } = useEditorSettings('markdown')
  const mode = ref<'edit' | 'split' | 'preview'>('split')
  const workspace = ref<HTMLElement>()
  const splitPercent = ref(50)
  const resizing = ref(false)
  let dragStartX = 0
  let dragStartPercent = 50
  function setSplit(value: number) {
    splitPercent.value = Math.min(70, Math.max(30, value))
  }
  function startResize(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    dragStartX = event.clientX
    dragStartPercent = splitPercent.value
    resizing.value = true
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function moveResize(event: PointerEvent) {
    if (!resizing.value || !workspace.value) return
    const width = workspace.value.getBoundingClientRect().width - 8
    if (width > 0) setSplit(dragStartPercent + (event.clientX - dragStartX) / width * 100)
  }
  function stopResize(event: PointerEvent) {
    resizing.value = false
    const handle = event.currentTarget as HTMLElement
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  }
  function resizeWithKeyboard(event: KeyboardEvent) {
    const values: Record<string, number> = { ArrowLeft: splitPercent.value - 2, ArrowRight: splitPercent.value + 2, Home: 30, End: 70, Enter: 50 }
    const value = values[event.key]
    if (value === undefined) return
    event.preventDefault()
    setSplit(value)
  }

  const editor = ref<HTMLTextAreaElement>()
  const sourceLines = computed(() => markdown.value.split('\n'))
  const sourceScrollTop = ref(0)
  const sourceWidth = ref(0)
  let sourceObserver: ResizeObserver | undefined
  function syncSource() {
    if (!editor.value) return
    sourceScrollTop.value = editor.value.scrollTop
    sourceWidth.value = editor.value.clientWidth
  }
  async function insertSnippet(snippet: string) {
    if (mode.value === 'preview') mode.value = 'edit'
    await nextTick()
    const field = editor.value
    if (!field) return
    const start = field.selectionStart
    const end = field.selectionEnd
    const value = markdown.value.slice(0, start) + snippet + markdown.value.slice(end)
    if (value.length > 100_000) return
    markdown.value = value
    await nextTick()
    field.focus()
    field.setSelectionRange(start + snippet.length, start + snippet.length)
  }

  let escapeTab = false
  async function indentOnTab(event: KeyboardEvent) {
    const releaseFocus = escapeTab
    escapeTab = event.key === 'Escape'
    if (event.key !== 'Tab' || releaseFocus || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
    const field = editor.value
    if (!field || field.disabled || field.readOnly) return
    event.preventDefault()
    const start = field.selectionStart
    const end = field.selectionEnd
    const direction = field.selectionDirection
    const text = markdown.value
    const from = text.slice(0, start).lastIndexOf('\n') + 1
    // A selection ending at the next line's start does not include that line.
    const lastSelected = end > start && text[end - 1] === '\n' ? end - 1 : end
    const lineEnd = text.indexOf('\n', lastSelected)
    const to = lineEnd < 0 ? text.length : lineEnd
    const lines = text.slice(from, to).split('\n')
    let firstDelta = 0
    let totalDelta = 0
    let endPosition = end
    const replacement = lines.map((line, index) => {
      const removed = event.shiftKey ? (line.match(new RegExp(`^(\\t| {1,${settings.value.width}})`))?.[0].length ?? 0) : 0
      const delta = event.shiftKey ? -removed : indentation.value.length
      if (index === 0) firstDelta = delta
      if (index === lines.length - 1) {
        const lineStart = to - line.length
        endPosition = Math.max(lineStart, end + delta) + totalDelta
      }
      totalDelta += delta
      return event.shiftKey ? line.slice(removed) : indentation.value + line
    }).join('\n')
    if (text.length + totalDelta > 100_000) return
    markdown.value = text.slice(0, from) + replacement + text.slice(to)
    await nextTick()
    field.setSelectionRange(Math.max(from, start + firstDelta), Math.max(from, endPosition), direction)
    syncSource()
  }

  onMounted(() => {
    if (window.matchMedia('(max-width: 59.999rem)').matches) mode.value = 'edit'
    sourceObserver = new ResizeObserver(syncSource)
    if (editor.value) sourceObserver.observe(editor.value)
    syncSource()
  })
  onBeforeUnmount(() => sourceObserver?.disconnect())
  return { mode, workspace, splitPercent, resizing, setSplit, startResize, moveResize, stopResize, resizeWithKeyboard, editor, sourceLines, sourceScrollTop, sourceWidth, syncSource, insertSnippet, indentOnTab, settings }
}
