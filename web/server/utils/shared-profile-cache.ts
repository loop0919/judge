import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

let client: LambdaClient | undefined
export async function sharedProfileCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  const functionName = process.env.PROFILE_CACHE_FUNCTION
  if (!functionName) return load()
  client ??= new LambdaClient({ maxAttempts: 1 })
  async function invoke(payload: object) {
    const response = await client!.send(new InvokeCommand({
      FunctionName: functionName, Payload: Buffer.from(JSON.stringify(payload)),
    }), { abortSignal: AbortSignal.timeout(6500) })
    if (response.FunctionError || !response.Payload) throw new Error('Cache invocation failed')
    return JSON.parse(Buffer.from(response.Payload).toString()) as { value?: string, token?: string, busy?: boolean }
  }
  let cached
  try { cached = await invoke({ action: 'read', key }) }
  catch {
    console.warn('Shared profile cache unavailable; using local cache')
    return load()
  }
  if (typeof cached.value === 'string') return JSON.parse(cached.value) as T
  if (!cached.token) throw new Error('Profile refresh already in progress')
  const value = await load()
  try { await invoke({ action: 'write', key, token: cached.token, value: JSON.stringify(value) }) }
  catch { console.warn('Shared profile cache write failed') }
  return value
}
