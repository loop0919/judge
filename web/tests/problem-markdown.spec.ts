import { expect, test } from '@playwright/test'
import { renderProblemMarkdown } from '../app/utils/problem-markdown'
import { draftErrors, exportProblemMarkdown } from '../app/utils/problem-draft'

test('colored text supports names and hex colors while preserving Markdown boundaries', () => {
  expect(renderProblemMarkdown('本文%赤文字ですよ%{red}と%白い文字%{#FFFFFF}です。'))
    .toContain('本文<span style="color: red">赤文字ですよ</span>と<span style="color: #FFFFFF">白い文字</span>です。')
  for (const color of ['blue', 'rebeccapurple', '#abc', '#abcd', '#123ABC', '#123ABC80']) {
    expect(renderProblemMarkdown(`| 説明 |\n| --- |\n| %文字%{${color}} |`))
      .toContain(`<td><span style="color: ${color}">文字</span></td>`)
  }
  expect(renderProblemMarkdown('%<img src=x onerror=alert(1)>&%{red}'))
    .toContain('<span style="color: red">&lt;img src=x onerror=alert(1)&gt;&amp;</span>')
  for (const source of ['`%文字%{red}`', '```text\n%文字%{red}\n```', '$%文字%{red}$', '\\%文字%{red}', '%文字%{red;display:none}', '%文字%{red" onclick="alert(1)}', '%文字%{#12345}', '%文字%{url(x)}', '%文字%{}', '%未完了', '50%です']) {
    expect(renderProblemMarkdown(source)).not.toContain('<span style="color:')
  }
})

test('attribute-free br tags break table cells without enabling HTML or changing code', () => {
  for (const tag of ['<br>', '<br/>', '<br />', '<BR>']) {
    const html = renderProblemMarkdown(`| 入力 | 説明 |\n| --- | --- |\n| \`3\`${tag}\`5\` | N と Q |`)
    expect(html).toContain('<td><code>3</code><br>\n<code>5</code></td>')
  }
  for (const source of ['`<br>`', '```text\n<br>\n```', '\\<br>', '&lt;br&gt;', '<br onclick="alert(1)">', '<br style="color:red">', '<bravo>', '</br>', '<img src=x onerror="alert(1)">']) {
    const html = renderProblemMarkdown(source)
    expect(html).not.toMatch(/<(br|bravo|img)\b/i)
    expect(html).toContain('&lt;')
  }
})

test('judge status shortcodes reuse badges and respect Markdown boundaries', () => {
  for (const verdict of ['AC', 'WA', 'TLE', 'MLE', 'OLE', 'RE', 'CE', 'JE', 'WJ']) {
    expect(renderProblemMarkdown(`結果は:${verdict}:です。`)).toContain(
      `<span class="verdict-badge"${verdict === 'WJ' ? '' : ` data-verdict="${verdict}"`}>${verdict}</span>`,
    )
  }
  expect(renderProblemMarkdown('**:AC:**:RE:')).toContain('</span></strong><span class="verdict-badge" data-verdict="RE">')
  for (const source of ['`:AC:`', '```text\n:RE:\n```', '```input\n:AC:\n```', '$:AC:$', '\\:AC:', ':UNKNOWN: :ac:', '[link](https://example.com/:AC:)']) {
    expect(renderProblemMarkdown(source)).not.toContain('verdict-badge')
  }
})

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

test('code fences highlight C++, C, Python, and Rust', () => {
  for (const [language, source] of [
    ['cpp', '#include <iostream>\nint main() { return 0; }'],
    ['c', '#include <stdio.h>\nint main(void) { return 0; }'],
    ['python', 'def answer():\n    return 42'],
    ['rust', 'fn main() { let answer = 42; }'],
  ]) {
    const html = renderProblemMarkdown(`\`\`\`${language}\n${source}\n\`\`\``)
    const lineNumbers = source.split('\n').map((_, line) => line + 1).join('\n')
    expect(html).toContain(`<pre class="highlighted-code"><span class="code-line-numbers" aria-hidden="true">${lineNumbers}</span>`)
    expect(html).toContain(`class="language-${language}"`)
    expect(html).toContain('<span class="hljs-')
    expect(html).not.toContain('<iostream>')
  }
  expect(renderProblemMarkdown('```text\nint main() {}\n```')).not.toContain('class="hljs ')
  expect(renderProblemMarkdown('```text\na\nb\n```')).not.toContain('code-line-numbers')
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
