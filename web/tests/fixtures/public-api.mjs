import { createServer } from 'node:http'
const problem = {
  id: '11111111-1111-4111-8111-111111111111', title: 'A + B', author: 'alice', publishedAt: '2026-09-10T00:00:00Z',
  timeLimitMs: 2000, memoryLimitMb: 256,
  markdown: '2 つの整数 $A$ と $B$ の和を求めてください。\n\n## 制約\n\n$1 \\le A,B \\le 10^9$\n\n## 入出力例\n\n```\n3 5\n```\n\n```\n8\n```\n\n最大の答えは 2000000000 です。',
  editorial: '## 解説\n\n$A+B$ を計算します。',
}
createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  const path = new URL(req.url, 'http://localhost').pathname
  if (path === '/auth/login' || path === '/auth/refresh') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    if (path === '/auth/refresh' && body.refresh_token !== 'valid-refresh') {
      res.writeHead(body.refresh_token === 'unavailable' ? 503 : 401).end('{}')
    } else res.end(JSON.stringify({ access_token: 'valid-access', expires_in: 3600, ...(path === '/auth/login' ? { refresh_token: 'valid-refresh' } : {}) }))
  }
  else if (path === '/auth/me' || path.startsWith('/my/')) {
    if (req.headers.authorization !== 'Bearer valid-access') return res.writeHead(401).end('{}')
    if (path === '/auth/me') return res.end(JSON.stringify({ id: 'session-user' }))
    if (req.method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      return res.end(raw)
    }
    res.end(JSON.stringify({ items: [], nextCursor: '' }))
  }
  else if (path === '/health') res.end('{}')
  else if (path === '/runtimes') res.end(JSON.stringify({ items: [{ id: 'cpp17', label: 'C++17 (GCC)' }, { id: 'python314', label: 'Python 3.14' }] }))
  else if (path === '/problems') res.end(JSON.stringify({ items: [problem], nextCursor: '' }))
  else if (path === `/problems/${problem.id}`) res.end(JSON.stringify(problem))
  else if (path === '/posts') res.end('{"items":[],"nextCursor":""}')
  else res.writeHead(404).end('{}')
}).listen(18080, '127.0.0.1')
