import { privateAPI } from './private-api'
import { hasSession } from './private-session'
import { limitedJSON, privateHeaders, requireSameOrigin } from './private-request'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  const id = getRouterParam(event, 'id')
  if (id && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw createError({ statusCode: 404 })
  const method = event.method
  if (method !== 'GET' && method !== 'PUT' && method !== 'DELETE') throw createError({ statusCode: 405 })
  if (method !== 'GET') requireSameOrigin(event)
  if (!id && method !== 'GET') throw createError({ statusCode: 405 })
  const query = getQuery(event)
  const params = new URLSearchParams()
  if (method === 'DELETE' && typeof query.version === 'string') params.set('version', query.version)
  if (!id && typeof query.cursor === 'string') params.set('cursor', query.cursor)
  if (!id && typeof query.role === 'string') params.set('role', query.role)
  const path = `/my/problems${id ? `/${id}` : ''}?${params}`
  const body = method === 'PUT' ? await limitedJSON(event, 3 << 20) : undefined
  const result = await privateAPI(event, path, { method, body })
  if (method === 'DELETE') return sendNoContent(event)
  return result
})
