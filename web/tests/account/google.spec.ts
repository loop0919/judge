import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

test('Google authorization uses PKCE and a private short-lived state cookie', async ({ page, context }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: 'Googleでログイン' })).toBeVisible()
  const response = await context.request.get('/auth/google', { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  const url = new URL(response.headers().location!)
  expect(url.origin).toBe('https://example.auth.ap-northeast-1.amazoncognito.com')
  expect(url.pathname).toBe('/oauth2/authorize')
  expect(url.searchParams.get('identity_provider')).toBe('Google')
  expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:13002/auth/google/callback')
  expect(url.searchParams.get('response_type')).toBe('code')
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  const cookie = (await context.cookies()).find(c => c.name === 'openoj_google_flow')!
  expect(cookie.httpOnly).toBe(true)
  expect(cookie.sameSite).toBe('Lax')
  const [state, verifier] = decodeURIComponent(cookie.value).split('.')
  expect(url.searchParams.get('state')).toBe(state)
  expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier!).digest('base64url'))
  expect(response.headers().location).not.toContain('browser-secret')
  expect(response.headers()['cache-control']).toBe('no-store')
})

test('unrequested, mismatched and cancelled callbacks cannot establish a session', async ({ context }) => {
  for (const kind of ['missing', 'mismatched', 'cancelled']) {
    let state = 'invalid'
    if (kind !== 'missing') {
      const start = await context.request.get('/auth/google', { maxRedirects: 0 })
      state = new URL(start.headers().location!).searchParams.get('state')!
    }
    const query = kind === 'cancelled' ? `state=${state}&error=access_denied` : 'state=invalid&code=forged'
    const response = await context.request.get(`/auth/google/callback?${query}`, { maxRedirects: 0 })
    expect(response.status()).toBe(303)
    expect(response.headers().location).toBe('/login?socialError=failed')
    expect((await context.cookies()).some(c => ['openoj_access', 'openoj_google_flow'].includes(c.name))).toBe(false)
  }
})


test('Google login preserves a tester invitation and rejects external return paths', async ({ context }) => {
  const invitation = `/my/tester-invitations/${'A'.repeat(32)}`
  for (const [next, expected] of [[invitation, invitation], ['https://attacker.example/', '/my'], ['//attacker.example/', '/my']]) {
    const response = await context.request.get(`/auth/google?${new URLSearchParams({ next: next! })}`, { maxRedirects: 0 })
    expect(response.status()).toBe(302)
    const flow = (await context.cookies()).find(cookie => cookie.name === 'openoj_google_flow')!
    const encoded = decodeURIComponent(flow.value).split('.')[2]!
    expect(Buffer.from(encoded, 'base64url').toString()).toBe(expected)
  }
})
