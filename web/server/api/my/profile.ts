import { profileResultSchema } from '../../../app/utils/profile'
import { privateHeaders, sessionCookie, requireSameOrigin, limitedJSON, privateAPI } from '../../utils/private-api'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!getCookie(event, sessionCookie)) throw createError({ statusCode: 401 })
  if (event.method !== 'GET' && event.method !== 'PUT') throw createError({ statusCode: 405 })
  if (event.method === 'PUT') requireSameOrigin(event)
  const body = event.method === 'PUT' ? await limitedJSON(event, 200 << 10) : undefined
  const parsed = profileResultSchema.safeParse(await privateAPI(event, '/my/profile', { method: event.method, body }))
  if (!parsed.success) throw createError({ statusCode: 502 })
  return parsed.data
})
