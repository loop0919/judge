import { test, expect } from '@playwright/test'

const origin = 'https://judge.example'
const base = 'http://127.0.0.1:13000'

test('login retains private refresh credentials and logout removes both cookies', async ({ context }) => {
  const response = await context.request.post('/api/auth/login', { headers: { Origin: origin }, data: { username: 'user', password: 'password' } })
  expect(response.ok()).toBe(true)
  expect(await response.json()).toEqual({ user: { id: 'session-user' } })
  const cookies = await context.cookies()
  for (const name of ['openoj_access', 'openoj_refresh']) {
    const cookie = cookies.find(c => c.name === name)!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.secure).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
  }
  expect(cookies.find(c => c.name === 'openoj_refresh')!.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400)
  const logout = await context.request.post('/api/auth/logout', { headers: { Origin: origin } })
  expect(logout.ok()).toBe(true)
  expect((await context.cookies()).filter(c => c.name.startsWith('openoj_'))).toEqual([])
})

for (const access of ['', 'expired-access']) {
  test(`submission refreshes ${access ? 'rejected' : 'expired cookie'} access without losing source`, async ({ context }) => {
    await context.addCookies([
      { name: 'openoj_refresh', value: 'valid-refresh', url: base },
      ...(access ? [{ name: 'openoj_access', value: access, url: base }] : []),
    ])
    const source = { problemId: '11111111-1111-4111-8111-111111111111', sourceCode: 'int main() { return 0; }', runtime: 'cpp17' }
    const response = await context.request.post('/api/my/submissions', { headers: { Origin: origin }, data: source })
    expect(response.status()).toBe(202)
    expect(await response.json()).toEqual(source)
    expect((await context.cookies()).find(c => c.name === 'openoj_access')?.value).toBe('valid-access')
    expect((await context.cookies()).find(c => c.name === 'openoj_refresh')?.value).toBe('valid-refresh')
  })
}

test('account and content requests recover when the access cookie has expired', async ({ context }) => {
  for (const path of ['/api/auth/me', '/api/my/posts', '/api/my/problems']) {
    await context.clearCookies()
    await context.addCookies([{ name: 'openoj_refresh', value: 'valid-refresh', url: base }])
    const response = await context.request.get(path)
    expect(response.status()).toBe(200)
    expect((await context.cookies()).find(c => c.name === 'openoj_access')?.value).toBe('valid-access')
  }
})

test('invalid refresh expires the session but a temporary outage retains it', async ({ context }) => {
  for (const token of ['invalid-refresh', 'unavailable']) {
    await context.clearCookies()
    await context.addCookies([{ name: 'openoj_refresh', value: token, url: base }])
    const response = await context.request.get('/api/auth/me')
    if (token === 'invalid-refresh') {
      expect(await response.json()).toEqual({ user: null })
      expect((await context.cookies()).find(c => c.name === 'openoj_refresh')).toBeUndefined()
    } else {
      expect(response.status()).toBe(503)
      expect((await context.cookies()).find(c => c.name === 'openoj_refresh')?.value).toBe(token)
    }
  }
})

test('refresh credentials do not bypass the origin check on submissions', async ({ context }) => {
  await context.addCookies([{ name: 'openoj_refresh', value: 'valid-refresh', url: base }])
  const response = await context.request.post('/api/my/submissions', { headers: { Origin: 'https://other.example' }, data: {} })
  expect(response.status()).toBe(403)
  expect((await context.cookies()).find(c => c.name === 'openoj_access')).toBeUndefined()
})
