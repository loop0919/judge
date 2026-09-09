import { createServer } from 'node:http'
const problem = {
  id: '11111111-1111-4111-8111-111111111111', title: 'A + B', author: 'alice', publishedAt: '2026-09-10T00:00:00Z',
  timeLimitMs: 2000, memoryLimitMb: 256,
  markdown: '2 つの整数 $A$ と $B$ の和を求めてください。\n\n## 制約\n\n$1 \\le A,B \\le 10^9$\n\n## 入出力例\n\n```\n3 5\n```\n\n```\n8\n```\n\n最大の答えは 2000000000 です。',
}
createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  const path = new URL(req.url, 'http://localhost').pathname
  if (path === '/health') res.end('{}')
  else if (path === '/problems') res.end(JSON.stringify({ items: [problem], nextCursor: '' }))
  else if (path === `/problems/${problem.id}`) res.end(JSON.stringify(problem))
  else if (path === '/posts') res.end('{"items":[],"nextCursor":""}')
  else res.writeHead(404).end('{}')
}).listen(18080, '127.0.0.1')
