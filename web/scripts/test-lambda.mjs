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

const api = createServer((req, res) => {
  if (req.url !== '/problems/a-plus-b') { res.writeHead(404).end(); return }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ id: 'a-plus-b', title: 'A + B', description: 'Sample', statement: ['整数 $A$ と $B$ の和'], constraints: [], inputFormat: '$A \\quad B$', outputFormat: '和', samples: [], timeLimitMs: 2000, memoryLimitMb: 256, isSample: true }))
})
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
process.env.NUXT_API_BASE_URL = `http://127.0.0.1:${api.address().port}`
process.env.NUXT_PUBLIC_SITE_URL = 'https://frontend.example'
const { handler } = await import(new URL('server/index.mjs', bundle).href)
async function invoke(path) {
  return handler({ version: '2.0', rawPath: path, rawQueryString: '', headers: { host: 'frontend.example', 'x-forwarded-proto': 'https' }, requestContext: { http: { method: 'GET', path, sourceIp: '127.0.0.1' } }, isBase64Encoded: false }, {})
}
try {
  const problem = await invoke('/problems/a-plus-b')
  assert.equal(problem.statusCode, 200)
  assert.match(problem.body, /katex-html/)
  assert.match(problem.body, /https:\/\/frontend.example\/problems\/a-plus-b/)
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
  console.log('Lambda SSR, API proxy, canonical URL, JS/CSS, binary fonts, and 404 passed')
} finally {
  await new Promise(resolve => api.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
