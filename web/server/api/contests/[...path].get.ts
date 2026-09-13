import { publicContent } from '../../utils/public-content'
import { hasSession, privateAPI, privateHeaders } from '../../utils/private-api'
export default defineEventHandler(async event => {
  privateHeaders(event)
  const path = getRouterParam(event, 'path') ?? ''
  const uuid = '[a-f0-9-]{36}'
  if (!new RegExp(`^${uuid}(?:/(?:standings|problems/${uuid}|submissions(?:/${uuid})?))?$`).test(path)) throw createError({ statusCode: 404 })
  if (hasSession(event) && (!path.includes('/') || path.includes('/problems/'))) {
    try { return await privateAPI(event, `/my/contests/${path}`) }
    catch (error) { if (![401, 403].includes((error as { statusCode?: number }).statusCode ?? 0)) throw error }
  }
  const offset = getQuery(event).offset
  return publicContent(event, `/contests/${path}?offset=${encodeURIComponent(typeof offset === 'string' ? offset : '0')}`)
})
