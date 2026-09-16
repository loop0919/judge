// Schedule after completion so slow requests never overlap with the next tick.
export function usePolling(task: () => Promise<unknown>, delay: number, enabled: () => boolean = () => true) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  async function tick() {
    try { if (!document.hidden && enabled()) await task() }
    finally { if (!disposed) timer = setTimeout(tick, delay) }
  }
  onMounted(() => { timer = setTimeout(tick, delay) })
  onScopeDispose(() => { disposed = true; clearTimeout(timer) })
}
