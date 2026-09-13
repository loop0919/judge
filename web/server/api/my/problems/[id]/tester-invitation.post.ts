import { hasSession, privateAPI, privateHeaders, requireSameOrigin } from '../../../../utils/private-api'
export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  requireSameOrigin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id)) throw createError({ statusCode: 404 })
  return privateAPI(event, `/my/problems/${id}/tester-invitation`, { method: 'POST' })
})
