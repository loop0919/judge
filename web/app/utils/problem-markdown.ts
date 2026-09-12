import MarkdownIt from 'markdown-it'
import container from 'markdown-it-container'
import { katex } from '@mdit/plugin-katex'
import { renderMathText } from './math-text'

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

markdown.renderer.rules.container_details_open = (tokens, index) => {
  const title = tokens[index]!.info.trim().slice('details'.length).trim() || '詳細'
  return `<details><summary>${markdown.utils.escapeHtml(title)}</summary>\n`
}
markdown.renderer.rules.container_details_close = () => '</details>\n'

const defaultFence = markdown.renderer.rules.fence!
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index]!
  if (token.info.trim() !== 'input') return defaultFence(tokens, index, options, env, renderer)
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
