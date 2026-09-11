import { privateAPI, privateHeaders, sessionCookie } from '../../../../../utils/private-api'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!getCookie(event, sessionCookie)) throw createError({ statusCode: 401 })
  return privateAPI(event, `/my/problems/${getRouterParam(event, 'id')}/test-files/${getRouterParam(event, 'file')}`)
})
