import { privateHeaders, hasSession, requireSameOrigin, limitedJSON, privateAPI } from './private-api'
export function privateContent(kind: 'posts' | 'problems', publication = false) {
  return defineEventHandler(async event => {
    privateHeaders(event)
    if (!hasSession(event)) throw createError({ statusCode: 401 })
    const id = getRouterParam(event, 'id')
    if (id && !/^[a-f0-9-]{36}$/.test(id)) throw createError({ statusCode: 404 })
    const method = event.method
    if (!['GET', 'PUT', 'DELETE'].includes(method) || (publication && method !== 'PUT') || (!id && method !== 'GET')) throw createError({ statusCode: 405 })
    if (method !== 'GET') requireSameOrigin(event)
    const query = getQuery(event)
    const params = new URLSearchParams()
    if (typeof query.cursor === 'string') params.set('cursor', query.cursor)
    if (typeof query.version === 'string') params.set('version', query.version)
    const body = method === 'PUT' ? await limitedJSON(event, publication ? 1024 : 700 << 10) : undefined
    const result = await privateAPI(event, `/my/${kind}${id ? `/${id}` : ''}${publication ? '/publication' : ''}?${params}`, { method: method as 'GET' | 'PUT' | 'DELETE', body })
    if (method === 'DELETE') return sendNoContent(event)
    return result
  })
}
