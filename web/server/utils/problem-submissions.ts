import { privateAPI } from './private-api'
import { hasSession } from './private-session'
import { privateHeaders } from './private-request'
import { publicContent } from './public-content'

export default defineEventHandler(async event => {
  privateHeaders(event)
  const id = getRouterParam(event, 'id') ?? ''
  const submission = getRouterParam(event, 'submission')
  if (!/^[a-f0-9-]{36}$/.test(id) || (submission && !/^[a-f0-9-]{36}$/.test(submission))) throw createError({ statusCode: 404 })
  const query = getQuery(event)
  if (query.mine === '1' && !hasSession(event)) throw createError({ statusCode: 401 })
  const search = new URLSearchParams({ offset: typeof query.offset === 'string' ? query.offset : '0', mine: typeof query.mine === 'string' ? query.mine : '0' })
  const path = `/problems/${id}/submissions${submission ? `/${submission}` : ''}?${search}`
  if (hasSession(event)) {
    try { return await privateAPI(event, `/my${path}`) }
    catch (error) { if (![401, 403].includes((error as { statusCode?: number }).statusCode ?? 0) || query.mine === '1') throw error }
  }
  return publicContent(event, path)
})
