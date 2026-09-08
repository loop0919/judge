import { createServer } from 'node:http'

createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/health') {
    res.end('{}')
  } else if (req.url === '/problems/math-fixture') {
    res.end(JSON.stringify({
      id: 'math-fixture', title: 'Math fixture', description: 'Math rendering test',
      statement: [
        String.raw`合計は $\sum_{i=1}^{n} a_i$ です。`,
        String.raw`$$\frac{n(n+1)}{2} = \sum_{i=1}^{n} i$$`,
        '<img src=x onerror="alert(1)">',
        String.raw`$\unknownCommand{x}$`,
        String.raw`$\href{javascript:alert(1)}{unsafe}$`,
        '$$' + Array.from({ length: 30 }, (_, i) => `x_{${i}}`).join('+') + '$$',
      ],
      constraints: [String.raw`$1 \le n \le 10^9$`],
      inputFormat: '$A \\quad B$\n$\\mathrm{case}_T$', outputFormat: '答えを出力してください。',
      samples: [{ input: '$literal input$\n', output: '$literal output$\n', explanation: '$1 + 2 = 3$' }],
      timeLimitMs: 2000, memoryLimitMb: 256, isSample: true,
    }))
  } else if (req.url === '/problems/invalid-body') {
    res.end(JSON.stringify({ id: 'invalid-body', title: 'Incomplete upstream data' }))
  } else {
    res.writeHead(503)
    res.end(JSON.stringify({ error: 'private-upstream-diagnostic' }))
  }
}).listen(18081, '127.0.0.1')
