import { initWasm, Resvg } from '@resvg/resvg-wasm'

let ready: Promise<Uint8Array> | undefined
function loadRenderer() {
  return ready ??= (async () => {
    const wasm = await useStorage('assets:resvg').getItemRaw<Buffer>('index_bg.wasm')
    const font = await useStorage('assets:server').getItemRaw<Buffer>('fonts/ipaexg.ttf')
    if (!wasm || !font) throw new Error('Share image assets are missing')
    await initWasm(wasm)
    return new Uint8Array(font)
  })().catch(error => { ready = undefined; throw error })
}

export function shareImageSvg(title: string, kind: string) {
  const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
  const chars = [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(title.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim())].map(item => item.segment)
  // ponytail: conservative 17-glyph lines fit Japanese and wide Latin letters; use font metrics if tighter wrapping is needed.
  const lines = [0, 17, 34].map(start => chars.slice(start, start + 17).join('')).filter(Boolean)
  if (chars.length > 51) lines[2] = chars.slice(34, 50).join('') + '…'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#fff"/>
    <rect width="16" height="630" fill="#18794e"/>
    <g transform="translate(72 56)">
      <rect width="64" height="64" rx="12" fill="#192431"/>
      <g stroke="#fff" stroke-width="5" fill="none"><path d="m15 22-7 10 7 10m34-20 7 10-7 10"/></g>
      <path d="m22 33 8 8 12-18" stroke="#57e3a0" stroke-width="5" fill="none"/>
    </g>
    <g font-family="IPAexGothic" fill="#192431">
      <text x="156" y="102" font-size="40">Share<tspan fill="#18794e">OJ</tspan></text>
      <text x="1128" y="96" text-anchor="end" font-size="24" fill="#536171">${escape(kind)}</text>
      ${lines.map((line, i) => `<text x="72" y="${lines.length === 1 ? 324 : 260 + i * 82}" font-size="60">${escape(line)}</text>`).join('')}
      <path d="M72 514H1128" stroke="#dce2e8"/>
      <text x="72" y="574" font-size="24" fill="#536171">問題をつくる。解く。共有する。</text>
      <text x="1128" y="574" text-anchor="end" font-size="26" fill="#18794e">#ShareOJ</text>
    </g>
  </svg>`
}

export async function renderShareImage(title: string, kind: string) {
  const font = await loadRenderer()
  const renderer = new Resvg(shareImageSvg(title, kind), { font: { fontBuffers: [font], defaultFontFamily: 'IPAexGothic', loadSystemFonts: false } })
  try {
    const image = renderer.render()
    try { return Buffer.from(image.asPng()) }
    finally { image.free() }
  } finally { renderer.free() }
}
