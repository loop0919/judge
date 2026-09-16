import { privateAPI } from '../../../../../utils/private-api'
import { hasSession } from '../../../../../utils/private-session'
import { privateHeaders } from '../../../../../utils/private-request'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!hasSession(event)) throw createError({ statusCode: 401 })
  return privateAPI(event, `/my/problems/${getRouterParam(event, 'id')}/test-files/${getRouterParam(event, 'file')}`)
})
