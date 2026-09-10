import type { Ref } from 'vue'

export function useMarkdownEditor(markdown: Ref<string>) {
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

  onMounted(() => {
    if (window.matchMedia('(max-width: 59.999rem)').matches) mode.value = 'edit'
    sourceObserver = new ResizeObserver(syncSource)
    if (editor.value) sourceObserver.observe(editor.value)
    syncSource()
  })
  onBeforeUnmount(() => sourceObserver?.disconnect())
  return { mode, workspace, splitPercent, resizing, setSplit, startResize, moveResize, stopResize, resizeWithKeyboard, editor, sourceLines, sourceScrollTop, sourceWidth, syncSource, insertSnippet }
}
