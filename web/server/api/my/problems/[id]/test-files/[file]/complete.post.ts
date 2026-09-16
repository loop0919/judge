import { privateAPI } from '../../../../../../utils/private-api'
import { hasSession } from '../../../../../../utils/private-session'
import { privateHeaders, requireSameOrigin } from '../../../../../../utils/private-request'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  requireSameOrigin(event)
  return privateAPI(event, `/my/problems/${getRouterParam(event, 'id')}/test-files/${getRouterParam(event, 'file')}/complete`, { method: 'POST', timeout: 22000 })
})
