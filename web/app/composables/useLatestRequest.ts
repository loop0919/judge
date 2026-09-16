import { onScopeDispose, ref } from 'vue'

// Share identical requests; a new key invalidates any older response.
export function useLatestRequest() {
  const loading = ref(false)
  let generation = 0
  let disposed = false
  let pending: { key: string, promise: Promise<void> } | undefined
  function invalidate() {
    generation++
    pending = undefined
    loading.value = false
  }
  function run<T>(key: string, fetch: () => Promise<T>, apply: (value: T) => void, fail: (error: unknown) => void): Promise<void> {
    if (disposed) return Promise.resolve()
    if (pending?.key === key) return pending.promise
    const current = ++generation
    loading.value = true
    const promise = Promise.resolve().then(fetch).then(value => {
      if (!disposed && current === generation) apply(value)
    }).catch(error => {
      if (!disposed && current === generation) fail(error)
    }).finally(() => {
      if (!disposed && current === generation) { loading.value = false; pending = undefined }
    })
    pending = { key, promise }
    return promise
  }
  onScopeDispose(() => { disposed = true; invalidate() })
  return { loading, run, invalidate }
}
