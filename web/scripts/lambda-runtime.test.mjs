import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

test('Runtime API handles warm invocations, failures and initialization errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bun-runtime-'))
  let child
  let next = 0
  const reports = []
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname.replace('/2018-06-01/runtime/', '')
      if (path === 'invocation/next') {
        if (next === 3) return new Promise(() => {})
        const id = String(++next)
        return Response.json({ fail: id === '2' }, { headers: {
          'lambda-runtime-aws-request-id': id,
          'lambda-runtime-deadline-ms': String(Date.now() + 10000),
          ...(id === '1' ? { 'lambda-runtime-trace-id': 'test-trace' } : {}),
        } })
      }
      reports.push({ path, body: await req.json() })
      return new Response(null, { status: 202 })
    },
  })
  const start = () => spawn(process.execPath, ['--no-env-file', 'lambda-runtime.mjs'], {
    cwd: dir, env: { ...process.env, AWS_LAMBDA_RUNTIME_API: `127.0.0.1:${server.port}` }, stdio: 'ignore',
  })
  try {
    await mkdir(join(dir, 'server'))
    await copyFile(new URL('./lambda-runtime.mjs', import.meta.url), join(dir, 'lambda-runtime.mjs'))
    await writeFile(join(dir, 'server/index.mjs'), `export function handler(event, context) {
      if (event.fail) throw new TypeError('fixture failure')
      return { id: context.awsRequestId, remaining: context.getRemainingTimeInMillis() > 0,
        trace: process.env._X_AMZN_TRACE_ID ?? null, bun: Boolean(process.versions.bun) }
    }`)
    child = start()
    for (let i = 0; reports.length < 3 && i < 200; i++) await Bun.sleep(25)
    assert.equal(reports.length, 3)
    assert.deepEqual(reports[0], { path: 'invocation/1/response', body: { id: '1', remaining: true, trace: 'test-trace', bun: true } })
    assert.equal(reports[1].path, 'invocation/2/error')
    assert.equal(reports[1].body.errorType, 'TypeError')
    assert.deepEqual(reports[2], { path: 'invocation/3/response', body: { id: '3', remaining: true, trace: null, bun: true } })
    child.kill()
    await once(child, 'exit')
    await writeFile(join(dir, 'server/index.mjs'), "throw new Error('init failure')")
    child = start()
    const [code] = await once(child, 'exit')
    assert.equal(code, 1)
    assert.equal(reports[3].path, 'init/error')
    assert.equal(reports[3].body.errorMessage, 'init failure')
  } finally {
    child?.kill()
    server.stop(true)
    await rm(dir, { recursive: true, force: true })
  }
})
