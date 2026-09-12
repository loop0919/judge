import { expect, test } from '@playwright/test'
import { renderProblemMarkdown } from '../app/utils/problem-markdown'
import { draftErrors, exportProblemMarkdown } from '../app/utils/problem-draft'

test('details render Markdown while preserving code fences and escaping titles', () => {
  expect(renderProblemMarkdown(':::details タイトル\n内容\n:::')).toBe('<details><summary>タイトル</summary>\n<p>内容</p>\n</details>\n')
  const html = renderProblemMarkdown([
    '::::details <img src=x onerror=alert(1)>', '**内容** $A$', '',
    '```text', ':::', '```', '::::', '', '後続の本文',
  ].join('\n'))
  expect(html).toContain('<details><summary>&lt;img src=x onerror=alert(1)&gt;</summary>')
  expect(html).toContain('<strong>内容</strong>')
  expect(html).toContain('class="katex"')
  expect(html).toContain('<code class="language-text">:::\n</code>')
  expect(html).toContain('</details>\n<p>後続の本文</p>')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<details open')
  expect(renderProblemMarkdown('```makefile\n:::details タイトル\n内容\n:::\n```')).not.toContain('<details>')
  expect(renderProblemMarkdown(':::details\n内容')).toContain('<summary>詳細</summary>\n<p>内容</p>\n</details>')
})

test('Markdown supports flexible structure and dedicated input / math fences', () => {
  const html = renderProblemMarkdown([
    '## 自由な見出し', '', '**太字**と $a_i$', '',
    '| A | B |', '| --- | --- |', '| 1 | 2 |', '',
    '```input', '$N$', '$A_1 \\quad A_N$', '```', '',
    '```math', '\\frac{n(n+1)}{2}', '```', '',
    '```text', '$literal$', '```', '', '`$code$`',
  ].join('\n'))
  expect(html).toContain('<h2>自由な見出し</h2>')
  expect(html).toContain('<strong>太字</strong>')
  expect(html).toContain('<table>')
  expect(html).toContain('class="input-format"')
  expect(html).toContain('class="katex-display"')
  expect(html).toContain('>$literal$\n</code>')
  expect(html).toContain('<code>$code$</code>')
  expect(html).not.toContain('$A_1')
})

test('HTML and malicious protocols cannot become executable content', () => {
  const html = renderProblemMarkdown([
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '[click](javascript:alert%281%29)',
    '```input', '<img src=x onerror=alert(1)> $A$', '```',
    '', '$\\href{javascript:alert(1)}{unsafe}$',
  ].join('\n'))
  expect(html).not.toMatch(/<(script|img)\b/i)
  expect(html).not.toMatch(/href=["']javascript:/i)
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('class="katex"')
})

test('unclosed fences and invalid math keep the preview usable; macros are isolated', () => {
  expect(() => renderProblemMarkdown('```math\n\\unknownCommand{x}')).not.toThrow()
  renderProblemMarkdown('$\\gdef\\openojmacro{123}\\openojmacro$')
  const next = renderProblemMarkdown('$\\openojmacro$')
  expect(next).not.toContain('>123<')
  expect(next).toContain('openojmacro')
})

test('export keeps the exact body and safely quotes title metadata', () => {
  const draft = { title: '問題: "和"\n改行', markdown: '## 本文\n\n```input\n$A$\n```', timeLimitMs: '2000', memoryLimitMb: '256' }
  const file = exportProblemMarkdown(draft)
  expect(file).toContain(`title: ${JSON.stringify(draft.title)}`)
  expect(file).toContain('time_limit_ms: 2000\nmemory_limit_mb: 256')
  expect(file).toContain(draft.markdown)
  expect(draftErrors({ ...draft, timeLimitMs: '', title: '  ' }).title).not.toBe('')
  expect(draftErrors({ ...draft, memoryLimitMb: '512' }).memoryLimitMb).toBe('')
  expect(draftErrors({ ...draft, memoryLimitMb: '513' }).memoryLimitMb).not.toBe('')
  expect(() => exportProblemMarkdown({ ...draft, memoryLimitMb: '-1' })).toThrow()
})
