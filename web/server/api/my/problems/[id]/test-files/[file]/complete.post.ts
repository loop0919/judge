import { privateAPI, privateHeaders, requireSameOrigin, hasSession } from '../../../../../../utils/private-api'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  requireSameOrigin(event)
  return privateAPI(event, `/my/problems/${getRouterParam(event, 'id')}/test-files/${getRouterParam(event, 'file')}/complete`, { method: 'POST', timeout: 22000 })
})
