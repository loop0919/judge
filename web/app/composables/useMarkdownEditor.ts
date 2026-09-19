export function useMarkdownEditor() {
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

  const editor = ref<{ insertSnippet: (snippet: string) => void, requestMeasure: () => void, focus: () => void }>()
  const syncSource = () => editor.value?.requestMeasure()
  async function insertSnippet(snippet: string) {
    if (mode.value === 'preview') mode.value = 'edit'
    await nextTick()
    editor.value?.insertSnippet(snippet)
  }

  onMounted(() => {
    if (window.matchMedia('(max-width: 59.999rem)').matches) mode.value = 'edit'
  })
  watch(mode, () => nextTick(syncSource))
  return { mode, workspace, splitPercent, resizing, setSplit, startResize, moveResize, stopResize, resizeWithKeyboard, editor, syncSource, insertSnippet }
}
