import assert from 'node:assert/strict'

const origin = new URL(process.argv[2])
async function get(path) {
  let response
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30000) })
      if (response.ok) return response
    } catch (error) {
      if (attempt === 11) throw error
    }
    if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`${path}: HTTP ${response?.status}`)
}
const html = await (await get('/problems/a-plus-b')).text()
assert.match(html, /OpenOJ/)
assert.match(html, /katex-html/)
assert.ok(html.includes(`${origin.origin}/problems/a-plus-b`), 'Public canonical URL missing')
for (const extension of ['js', 'css']) {
  const path = html.match(new RegExp(`(?:src|href)="([^" ]+\\.${extension})"`))?.[1]
  assert.ok(path, `${extension} asset missing`)
  const asset = await get(path)
  assert.ok((await asset.arrayBuffer()).byteLength > 0)
}
assert.match(await (await get('/problems/new')).text(), /noindex/)
console.log(`Frontend SSR, assets, and editor verified: ${origin.origin}`)
