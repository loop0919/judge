export function useContentPages<T>(initial: { items: T[], nextCursor: string }, fetchPage: (cursor: string) => Promise<{ items: T[], nextCursor: string }>) {
  const pages = shallowRef([initial])
  const index = ref(0)
  const loading = ref(false)
  const message = ref('')
  const current = computed(() => pages.value[index.value]!)
  async function move(direction: -1 | 1) {
    const target = index.value + direction
    if (loading.value || target < 0 || (target === pages.value.length && !current.value.nextCursor)) return
    message.value = ''
    loading.value = true
    try {
      if (target === pages.value.length) pages.value = [...pages.value, await fetchPage(current.value.nextCursor)]
      index.value = target
    } catch { message.value = '一覧を取得できませんでした。もう一度お試しください。' }
    finally { loading.value = false }
  }
  return { current, index, loading, message, move }
}
