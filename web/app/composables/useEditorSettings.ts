export function useEditorSettings() {
  const settings = useState('editor-settings', () => ({ style: 'space' as 'space' | 'tab', width: 4 }))
  const loaded = useState('editor-settings-loaded', () => false)
  const storageKey = 'openoj.editor-settings'
  onMounted(() => {
    if (loaded.value) return
    loaded.value = true
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved && ['space', 'tab'].includes(saved.style) && Number.isInteger(saved.width) && saved.width >= 1 && saved.width <= 8) {
        settings.value = { style: saved.style, width: saved.width }
      }
    } catch { /* Keep editing available without browser storage. */ }
  })
  function saveSettings() {
    try { localStorage.setItem(storageKey, JSON.stringify(settings.value)) }
    catch { /* Settings still apply for this session. */ }
  }
  const indentation = computed(() => settings.value.style === 'tab' ? '\t' : ' '.repeat(settings.value.width))
  return { settings, indentation, saveSettings }
}
