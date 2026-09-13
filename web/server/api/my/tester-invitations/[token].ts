import { hasSession, privateAPI, privateHeaders, requireSameOrigin } from '../../../utils/private-api'
export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  if (event.method !== 'GET' && event.method !== 'POST') throw createError({ statusCode: 405 })
  if (event.method === 'POST') requireSameOrigin(event)
  const token = getRouterParam(event, 'token') ?? ''
  if (!/^[A-Z2-7]{32}$/.test(token)) throw createError({ statusCode: 404 })
  return privateAPI(event, `/my/tester-invitations/${token}`, { method: event.method })
})
