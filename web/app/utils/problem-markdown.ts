import MarkdownIt from 'markdown-it'
import container from 'markdown-it-container'
import { katex } from '@mdit/plugin-katex'
import hljs from 'highlight.js/lib/core'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import { renderMathText } from './math-text'

hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)

const codeLanguages = new Map([
  ['c', 'c'], ['cpp', 'cpp'], ['c++', 'cpp'],
  ['python', 'python'], ['py', 'python'],
  ['rust', 'rust'], ['rs', 'rust'],
])

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })
  .use(katex, {
    mathFence: true,
    trust: false,
    strict: 'error',
    logger: () => 'error' as const,
    throwOnError: false,
    maxExpand: 1000,
    maxSize: 20,
  })
  .use(container, 'details')

// Discard comments without allowing general HTML; code rules keep literal examples intact.
markdown.block.ruler.before('html_block', 'html_comment', (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine]! + state.tShift[startLine]!
  if (state.sCount[startLine]! - state.blkIndent >= 4 || !state.src.startsWith('<!--', start)) return false
  if (silent) return true
  let nextLine = startLine
  while (nextLine < endLine) {
    if (nextLine > startLine && state.sCount[nextLine]! < state.blkIndent && !state.isEmpty(nextLine)) break
    const line = state.src.slice(state.bMarks[nextLine]! + state.tShift[nextLine]!, state.eMarks[nextLine])
    nextLine++
    if (line.includes('-->')) break
  }
  state.line = nextLine
  return true
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

markdown.inline.ruler.before('html_inline', 'html_comment', (state) => {
  if (!state.src.startsWith('<!--', state.pos)) return false
  const end = state.src.indexOf('-->', state.pos + 4)
  if (end < 0 || end + 3 > state.posMax) return false
  state.pos = end + 3
  return true
})

markdown.inline.ruler.before('text', 'colored_text', (state, silent) => {
  if (state.src[state.pos] !== '%') return false
  const match = /^%([^%\r\n]+)%\{([a-zA-Z]+|#(?:[\da-fA-F]{8}|[\da-fA-F]{6}|[\da-fA-F]{4}|[\da-fA-F]{3}))\}/.exec(state.src.slice(state.pos, state.posMax))
  if (!match) return false
  if (!silent) {
    const token = state.push('colored_text', 'span', 0)
    token.content = match[1]!
    token.attrSet('style', `color: ${match[2]}`)
  }
  state.pos += match[0].length
  return true
})
markdown.renderer.rules.colored_text = (tokens, index, options, env, renderer) => {
  const token = tokens[index]!
  return `<span${renderer.renderAttrs(token)}>${markdown.utils.escapeHtml(token.content)}</span>`
}

// Accept only an attribute-free line break; keep general HTML disabled.
markdown.inline.ruler.before('html_inline', 'line_break_tag', (state, silent) => {
  if (state.src[state.pos] !== '<') return false
  const match = /^<br[ \t]*\/?>/i.exec(state.src.slice(state.pos))
  if (!match) return false
  if (!silent) state.push('hardbreak', 'br', 0)
  state.pos += match[0].length
  return true
})

markdown.inline.ruler.before('text', 'judge_status', (state, silent) => {
  if (state.src[state.pos] !== ':') return false
  const match = /^:(AC|WA|TLE|MLE|OLE|RE|CE|JE|WJ):/.exec(state.src.slice(state.pos))
  if (!match) return false
  if (!silent) {
    const token = state.push('judge_status', 'span', 0)
    token.content = match[1]!
  }
  state.pos += match[0].length
  return true
})
markdown.renderer.rules.judge_status = (tokens, index) => {
  const verdict = tokens[index]!.content
  return `<span class="verdict-badge"${verdict === 'WJ' ? '' : ` data-verdict="${verdict}"`}>${verdict}</span>`
}

markdown.renderer.rules.container_details_open = (tokens, index) => {
  const title = tokens[index]!.info.trim().slice('details'.length).trim() || '詳細'
  return `<details><summary>${markdown.utils.escapeHtml(title)}</summary>\n`
}
markdown.renderer.rules.container_details_close = () => '</details>\n'

const defaultFence = markdown.renderer.rules.fence!
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index]!
  const language = token.info.trim().split(/\s+/, 1)[0]!.toLowerCase()
  if (language !== 'input') {
    const registeredLanguage = codeLanguages.get(language)
    if (!registeredLanguage) return defaultFence(tokens, index, options, env, renderer)
    const highlighted = hljs.highlight(token.content, { language: registeredLanguage, ignoreIllegals: true }).value
    const lineCount = token.content.replace(/\n$/, '').split('\n').length
    const lineNumbers = Array.from({ length: lineCount }, (_, line) => line + 1).join('\n')
    return `<pre class="highlighted-code"><span class="code-line-numbers" aria-hidden="true">${lineNumbers}</span><code class="language-${registeredLanguage}">${highlighted}</code></pre>\n`
  }
  const content = renderMathText(token.content.trimEnd()).map(part => {
    if (part.kind === 'text') return markdown.utils.escapeHtml(part.text)
    return `<span class="math-expression${part.display ? ' math-expression--display' : ''}">${part.html}</span>`
  }).join('')
  return `<div class="input-format">${content}</div>\n`
}

// User-authored markup cannot supply general HTML or executable link protocols.
// Each render gets fresh state; macros must not leak between documents.
export function renderProblemMarkdown(source: string): string {
  if (source.length > 100_000) return '<p>本文は100,000文字以内で入力してください。</p>'
  return markdown.render(source, {})
}
