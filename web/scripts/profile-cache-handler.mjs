import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

let client
export async function handler(event) {
  if (!/^(?:(?:atcoder|codeforces):[a-z0-9_.-]{1,24}|yukicoder:[0-9]{1,20})$/.test(event?.key ?? '')
    || !['read', 'write'].includes(event?.action)) throw new Error('Invalid cache request')
  if (!client || client.status === 'end') {
    const url = process.env.PROFILE_CACHE_URL
    if (!url || (process.env.AWS_LAMBDA_FUNCTION_NAME && !url.startsWith('rediss://'))) throw new Error('Missing TLS cache URL')
    client = new Redis(url, { connectTimeout: 1000, commandTimeout: 1000, maxRetriesPerRequest: 1, retryStrategy: () => null })
    client.on('error', () => { console.warn('Profile cache connection unavailable') })
  }
  const key = `profile:{${event.key}}`
  const lock = `${key}:lock`
  if (event.action === 'write') {
    if (typeof event.token !== 'string' || typeof event.value !== 'string' || event.value.length > 2048) throw new Error('Invalid cache value')
    JSON.parse(event.value)
    // Both keys share a hash slot; a late writer cannot overwrite the next lease's result.
    const saved = await client.eval("if redis.call('get',KEYS[2]) == ARGV[1] then redis.call('set',KEYS[1],ARGV[2],'EX',300); redis.call('del',KEYS[2]); return 1 end; return 0", 2, key, lock, event.token, event.value)
    return { saved: saved === 1 }
  }
  const deadline = Date.now() + 4500
  do {
    const value = await client.get(key)
    if (value !== null) return { value }
    const token = randomUUID()
    if (await client.set(lock, token, 'EX', 15, 'NX')) {
      // A previous writer may have populated the value between GET and SET NX.
      const latest = await client.get(key)
      if (latest !== null) return { value: latest }
      return { token }
    }
    await delay(150)
  } while (Date.now() < deadline)
  return { busy: true }
}

export function disconnect() { client?.disconnect(); client = undefined }
