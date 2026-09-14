import { z } from 'zod'
import { socialPages } from '~~/shared/social-pages'
import { publicContent } from '../../utils/public-content'
import { renderShareImage } from '../../utils/share-image'

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const raw = getRouterParam(event, 'path') ?? ''
  if (!raw.endsWith('.png')) throw createError({ statusCode: 404 })
  const path = raw === 'index.png' ? '/' : `/${raw.slice(0, -4)}`
  let content = Object.hasOwn(socialPages, path) ? socialPages[path] : undefined
  if (!content) {
    const uuid = '[a-f0-9-]{36}'
    const match = new RegExp(`^/(problems|contests|blog)/(${uuid})(?:/problems/(${uuid}))?$`).exec(path)
    if (!match || (match[3] && match[1] !== 'contests')) throw createError({ statusCode: 404 })
    if (match[3]) {
      const contest = z.object({ status: z.enum(['scheduled', 'running', 'ended']) }).safeParse(await publicContent(event, `/contests/${match[2]}`))
      if (!contest.success) throw createError({ statusCode: 502 })
      if (contest.data.status === 'scheduled') throw createError({ statusCode: 404 })
    }
    const apiPath = path.replace(/^\/blog\//, '/posts/')
    // Fetch the public API directly: never forward a session or fall back to private content.
    const result = z.object({ id: z.string(), title: z.string().min(1).max(1000) }).safeParse(await publicContent(event, apiPath))
    if (!result.success || result.data.id !== (match[3] ?? match[2])) throw createError({ statusCode: 502 })
    content = { title: result.data.title, kind: match[1] === 'blog' ? 'ARTICLE' : match[1] === 'problems' || match[3] ? 'PROBLEM' : 'CONTEST' }
  }
  const image = await renderShareImage(content.title, content.kind)
  setResponseHeader(event, 'Content-Type', 'image/png')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return image
})
