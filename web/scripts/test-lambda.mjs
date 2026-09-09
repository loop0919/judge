import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

// Test the shipped zip outside the repository so node_modules cannot hide missing files.
const directory = await mkdtemp(join(tmpdir(), 'openoj-lambda-'))
execFileSync('python3', ['-m', 'zipfile', '-e', fileURLToPath(new URL('../.build/web.zip', import.meta.url)), directory])
const bundle = pathToFileURL(`${directory}/`)
process.env.NODE_ENV = 'production'

const api = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json')
  if (['/auth/signup', '/auth/confirm-signup', '/auth/resend-confirmation'].includes(req.url)) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString())
    if (input.email !== 'new@example.test') { res.writeHead(400).end('{}'); return }
    const result = req.url === '/auth/resend-confirmation' ? { sent: true } : { confirmed: req.url === '/auth/confirm-signup' }
    res.end(JSON.stringify({ ...result, access_token: 'must-not-reach-browser' })); return
  }
  if (req.url === '/auth/login') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString())
    if (input.username !== 'alice@example.test' || input.password !== 'test-password') { res.writeHead(400).end('{}'); return }
    res.end(JSON.stringify({ access_token: 'test-access-token', id_token: 'private-id-token', refresh_token: 'private-refresh-token', expires_in: 3600 }))
    return
  }
  if (req.url === '/my/profile') { res.end(JSON.stringify({ profile: null })); return }
  if (req.url === '/auth/me') {
    if (req.headers.authorization !== 'Bearer test-access-token') { res.writeHead(401).end('{}'); return }
    res.end(JSON.stringify({ id: 'alice' })); return
  }
  if (req.url?.startsWith('/my/problems/')) {
    if (req.headers.authorization !== 'Bearer test-access-token') { res.writeHead(401).end('{}'); return }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    res.end(Buffer.concat(chunks)); return
  }
  if (req.url !== '/problems/11111111-1111-4111-8111-111111111111') { res.writeHead(404).end(); return }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', title: 'A + B', markdown: '整数 $A$ と $B$ の和', author: 'alice', publishedAt: '2026-09-10T00:00:00Z', timeLimitMs: 2000, memoryLimitMb: 256 }))
})
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
process.env.NUXT_API_BASE_URL = `http://127.0.0.1:${api.address().port}`
process.env.NUXT_PUBLIC_SITE_URL = 'https://frontend.example'
process.env.NUXT_COGNITO_DOMAIN = 'https://google-test.auth.ap-northeast-1.amazoncognito.com'
process.env.NUXT_COGNITO_CLIENT_ID = 'test-client'
process.env.NUXT_COGNITO_CLIENT_SECRET = 'test-secret'
const originalFetch = globalThis.fetch
let exchanges = 0
let expectedVerifier = ''
globalThis.fetch = async (input, options) => {
  if (String(input) !== `${process.env.NUXT_COGNITO_DOMAIN}/oauth2/token`) return originalFetch(input, options)
  exchanges++
  assert.equal(new Headers(options.headers).get('authorization'), `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`)
  const form = new URLSearchParams(options.body)
  assert.equal(form.get('redirect_uri'), 'https://frontend.example/auth/google/callback')
  assert.equal(form.get('code_verifier'), expectedVerifier)
  assert.equal(form.get('grant_type'), 'authorization_code')
  return Response.json({ access_token: form.get('code') === 'valid' ? 'test-access-token' : 'invalid-token', token_type: 'Bearer', expires_in: 3600 })
}
const { handler } = await import(new URL('server/index.mjs', bundle).href)
async function invoke(path, { method = 'GET', body, cookies, origin = 'https://frontend.example' } = {}) {
  const [pathname, query = ''] = path.split('?')
  return handler({ version: '2.0', rawPath: pathname, rawQueryString: query, queryStringParameters: Object.fromEntries(new URLSearchParams(query)), headers: { host: 'frontend.example', 'x-forwarded-proto': 'https', origin, 'content-type': 'application/json' }, requestContext: { http: { method, path: pathname, sourceIp: '127.0.0.1' } }, body: body ? JSON.stringify(body) : undefined, cookies, isBase64Encoded: false }, {})
}
try {
  for (const code of ['valid', 'invalid']) {
    const start = await invoke('/auth/google')
    assert.equal(start.statusCode, 302)
    const state = new URL(start.headers.location).searchParams.get('state')
    const flowCookie = start.cookies.find(value => value.startsWith('openoj_google_flow='))
    assert.match(flowCookie, /HttpOnly/)
    assert.match(flowCookie, /Secure/)
    expectedVerifier = decodeURIComponent(flowCookie.split(';')[0].split('=')[1]).split('.')[1]
    const callback = await invoke(`/auth/google/callback?code=${code}&state=${state}`, { cookies: [flowCookie.split(';')[0]] })
    assert.equal(callback.statusCode, 303)
    assert.equal(callback.headers.location, code === 'valid' ? '/onboarding' : '/login?socialError=failed')
    assert.equal(callback.cookies.some(cookie => cookie.startsWith('openoj_access=')), code === 'valid')
    assert.ok(!callback.body.includes('test-access-token'))
  }
  assert.equal(exchanges, 2)
  console.log('Google OAuth callback: code exchange, PKCE, secret authentication, verified session and invalid-token rejection passed')
  const problem = await invoke('/problems/11111111-1111-4111-8111-111111111111')
  assert.equal(problem.statusCode, 200)
  assert.match(problem.body, /katex-html/)
  assert.match(problem.body, /https:\/\/frontend.example\/problems\/11111111-1111-4111-8111-111111111111/)
  const editor = await invoke('/problems/new')
  assert.equal(editor.statusCode, 200)
  assert.match(editor.body, /noindex/)
  const assets = await readdir(new URL('public/_nuxt/', bundle))
  for (const suffix of ['.js', '.css', '.woff2']) {
    const file = assets.find(name => name.endsWith(suffix))
    assert.ok(file, `Missing ${suffix} asset`)
    const result = await invoke(`/_nuxt/${file}`)
    assert.equal(result.statusCode, 200)
    assert.ok(result.body.length > 0)
    if (suffix === '.woff2') assert.equal(result.isBase64Encoded, true)
  }
  assert.equal((await invoke('/problems/missing')).statusCode, 404)
  const signupPage = await invoke('/signup')
  assert.equal(signupPage.statusCode, 200)
  assert.match(signupPage.body, /noindex/)
  for (const [action, body, expected] of [
    ['signup', { email: 'new@example.test', password: 'ValidPassword123!' }, { confirmed: false }],
    ['confirm-signup', { email: 'new@example.test', code: '123456' }, { confirmed: true }],
    ['resend-confirmation', { email: 'new@example.test' }, { sent: true }],
  ]) {
    const result = await invoke(`/api/auth/${action}`, { method: 'POST', body })
    assert.equal(result.statusCode, 200, result.body)
    assert.deepEqual(JSON.parse(result.body), expected)
    assert.ok(!result.cookies?.length)
    assert.equal(result.headers['cache-control'], 'no-store')
  }
  const login = await invoke('/api/auth/login', { method: 'POST', body: { username: 'alice@example.test', password: 'test-password' } })
  assert.equal(login.statusCode, 200, login.body)
  assert.deepEqual(JSON.parse(login.body), { user: { id: 'alice' } })
  const cookie = login.cookies.find(value => value.startsWith('openoj_access='))
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /Secure/i)
  assert.match(cookie, /SameSite=Lax/i)
  const cookies = [cookie.split(';')[0]]
  const input = { version: 0, draft: { title: 'Lambdaで保存', markdown: '本文', timeLimitMs: '2000', memoryLimitMb: '1024' } }
  const path = '/api/my/problems/11111111-1111-4111-8111-111111111111'
  const saved = await invoke(path, { method: 'PUT', cookies, body: input })
  assert.equal(saved.statusCode, 200, saved.body)
  assert.deepEqual(JSON.parse(saved.body), input)
  assert.equal(saved.headers['cache-control'], 'no-store')
  assert.equal((await invoke(path, { method: 'PUT', cookies, body: input, origin: 'https://attacker.example' })).statusCode, 403)
  assert.equal((await invoke(path, { method: 'PUT', body: input })).statusCode, 401)
  assert.equal((await invoke(path, { method: 'PUT', cookies, body: { draft: { markdown: 'x'.repeat(800000) } } })).statusCode, 413)
  console.log('Lambda signup, confirmation, resend, login, secure cookie, authenticated body forwarding, CSRF protection, SSR, API proxy, canonical URL, JS/CSS, binary fonts, and 404 passed')
} finally {
  globalThis.fetch = originalFetch
  await new Promise(resolve => api.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
