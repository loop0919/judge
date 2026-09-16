import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'

test('Valkey shares values and refresh leases across Lambda instances', { skip: !process.env.PROFILE_CACHE_TEST_URL }, async () => {
  process.env.PROFILE_CACHE_URL = process.env.PROFILE_CACHE_TEST_URL
  const { handler: first } = await import('./profile-cache-handler.mjs?first')
  const { handler: second } = await import('./profile-cache-handler.mjs?second')
  const redis = new Redis(process.env.PROFILE_CACHE_TEST_URL)
  const key = `yukicoder:${Date.now()}`
  const dataKey = `profile:{${key}}`
  try {
    await assert.rejects(() => first({ action: 'read', key: '../anything' }))
    const lease = await first({ action: 'read', key })
    assert.ok(lease.token)
    const waiting = second({ action: 'read', key })
    const value = JSON.stringify({ name: 'ゆきユーザー' })
    assert.deepEqual(await first({ action: 'write', key, token: randomUUID(), value }), { saved: false })
    assert.deepEqual(await first({ action: 'write', key, token: lease.token, value }), { saved: true })
    assert.deepEqual(await waiting, { value })
    assert.deepEqual(await second({ action: 'read', key }), { value })
    assert.ok((await redis.ttl(dataKey)) > 290)
    // Expiry permits one new fetch; the previous lease cannot overwrite it.
    await redis.del(dataKey)
    const next = await second({ action: 'read', key })
    assert.ok(next.token)
    assert.notEqual(next.token, lease.token)
    assert.deepEqual(await first({ action: 'write', key, token: lease.token, value }), { saved: false })
    assert.deepEqual(await second({ action: 'write', key, token: next.token, value }), { saved: true })
  } finally {
    await redis.del(dataKey, `${dataKey}:lock`)
    redis.disconnect()
    // These are warm Lambda connection pools in production.
    const { disconnect: closeFirst } = await import('./profile-cache-handler.mjs?first')
    const { disconnect: closeSecond } = await import('./profile-cache-handler.mjs?second')
    closeFirst(); closeSecond()
  }
})

test('frontend uses the IAM Lambda bridge and falls back when it is unavailable', { skip: !process.env.PROFILE_CACHE_TEST_URL }, async () => {
  const { createServer } = await import('node:http')
  const { setTimeout: delay } = await import('node:timers/promises')
  const { handler, disconnect } = await import('./profile-cache-handler.mjs')
  process.env.PROFILE_CACHE_URL = process.env.PROFILE_CACHE_TEST_URL
  process.env.PROFILE_CACHE_FUNCTION = 'test-profile-cache'
  process.env.AWS_REGION = 'ap-northeast-1'
  process.env.AWS_ACCESS_KEY_ID = 'testing'
  process.env.AWS_SECRET_ACCESS_KEY = 'testing'
  let unavailable = false
  const server = createServer(async (req, res) => {
    if (unavailable) { res.writeHead(503).end('{}'); return }
    try {
      assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 /)
      let body = ''
      for await (const chunk of req) body += chunk
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(await handler(JSON.parse(body))))
    } catch { res.writeHead(500).end('{}') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  process.env.AWS_ENDPOINT_URL_LAMBDA = `http://127.0.0.1:${server.address().port}`
  const { sharedProfileCache } = await import('../server/utils/shared-profile-cache.ts')
  const key = `yukicoder:${Date.now()}`
  const redis = new Redis(process.env.PROFILE_CACHE_TEST_URL)
  let calls = 0
  const load = async () => { calls++; await delay(50); return { name: 'shared' } }
  try {
    assert.deepEqual(await Promise.all([sharedProfileCache(key, load), sharedProfileCache(key, load)]), [{ name: 'shared' }, { name: 'shared' }])
    assert.equal(calls, 1)
    assert.deepEqual(await sharedProfileCache(key, load), { name: 'shared' })
    assert.equal(calls, 1)
    unavailable = true
    assert.deepEqual(await sharedProfileCache('yukicoder:9999999', load), { name: 'shared' })
    assert.equal(calls, 2)
  } finally {
    await redis.del(`profile:{${key}}`, `profile:{${key}}:lock`)
    redis.disconnect(); disconnect()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
