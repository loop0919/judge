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

// User-authored markup cannot supply HTML or executable link protocols.
// Each render gets fresh state; macros must not leak between documents.
export function renderProblemMarkdown(source: string): string {
  if (source.length > 100_000) return '<p>本文は100,000文字以内で入力してください。</p>'
  return markdown.render(source, {})
}
