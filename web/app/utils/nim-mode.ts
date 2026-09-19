import type { StreamParser } from '@codemirror/language'

const keywords = new Set('addr and as asm bind block break case cast concept const continue converter defer discard distinct div do elif else end enum except export finally for from func generic if import in include interface is isnot iterator let macro method mixin mod not notin object of or out proc ptr raise ref return shl shr static template try tuple type using var when while xor yield'.split(' '))

// ponytail: lexical highlighting; use a full Nim grammar if structural completion is needed.
export const nim: StreamParser<{ comments: number, triple: boolean }> = {
  name: 'nim',
  startState: () => ({ comments: 0, triple: false }),
  token(stream, state) {
    if (state.comments || stream.match('#[')) {
      if (!state.comments) state.comments = 1
      while (!stream.eol()) {
        if (stream.match('#[')) state.comments++
        else if (stream.match(']#')) { if (!--state.comments) break }
        else stream.next()
      }
      return 'comment'
    }
    if (state.triple || stream.match('"""')) {
      state.triple = true
      while (!stream.eol()) {
        if (stream.match('"""')) { state.triple = false; break }
        stream.next()
      }
      return 'string'
    }
    if (stream.eatSpace()) return null
    if (stream.eat('#')) { stream.skipToEnd(); return 'comment' }
    if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)'/)) return 'string'
    if (stream.match(/\d[\w.']*/)) return 'number'
    const word = stream.match(/[A-Za-z_]\w*/)
    if (Array.isArray(word)) {
      const normalized = word[0].replaceAll('_', '').toLowerCase()
      if (keywords.has(normalized)) return 'keyword'
      if (['true', 'false', 'nil'].includes(normalized)) return 'atom'
      return 'variable'
    }
    stream.next()
    return null
  },
  languageData: { commentTokens: { line: '#', block: { open: '#[', close: ']#' } } },
}
