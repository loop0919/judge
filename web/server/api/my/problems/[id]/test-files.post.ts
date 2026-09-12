import { limitedJSON, privateAPI, privateHeaders, requireSameOrigin, hasSession } from '../../../../utils/private-api'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  requireSameOrigin(event)
  const id = getRouterParam(event, 'id')
  const body = await limitedJSON(event, 2 << 10)
  return privateAPI(event, `/my/problems/${id}/test-files`, { method: 'POST', body })
})
