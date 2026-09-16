export function useContentPages<T>(initial: { items: T[], nextCursor: string }, fetchPage: (cursor: string) => Promise<{ items: T[], nextCursor: string }>) {
  const pages = shallowRef([initial])
  const index = ref(0)
  const { loading, run } = useLatestRequest()
  const message = ref('')
  const current = computed(() => pages.value[index.value]!)
  async function move(direction: -1 | 1) {
    const target = index.value + direction
    if (loading.value || target < 0 || (target === pages.value.length && !current.value.nextCursor)) return
    message.value = ''
    await run(String(target), async () => target === pages.value.length ? await fetchPage(current.value.nextCursor) : null,
      page => {
        if (page) pages.value = [...pages.value, page]
        index.value = target
      },
      () => { message.value = '一覧を取得できませんでした。もう一度お試しください。' })
  }
  return { current, index, loading, message, move }
}
