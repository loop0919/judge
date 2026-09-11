import { limitedJSON, privateAPI, privateHeaders, requireSameOrigin, sessionCookie } from '../../../../utils/private-api'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!getCookie(event, sessionCookie)) throw createError({ statusCode: 401 })
  requireSameOrigin(event)
  const id = getRouterParam(event, 'id')
  const body = await limitedJSON(event, 2 << 10)
  return privateAPI(event, `/my/problems/${id}/test-files`, { method: 'POST', body })
})
