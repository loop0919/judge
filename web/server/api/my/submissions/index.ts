import { limitedJSON, privateAPI, privateHeaders, requireSameOrigin, sessionCookie } from '../../../utils/private-api'
import type { Submission } from '../../../../shared/types/submission'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!getCookie(event, sessionCookie)) throw createError({ statusCode: 401 })
  if (event.method === 'GET') return privateAPI<{ items: Submission[] }>(event, '/my/submissions')
  if (event.method !== 'POST') throw createError({ statusCode: 405 })
  requireSameOrigin(event)
  const body = await limitedJSON(event, 400 << 10)
  const result = await privateAPI<Submission>(event, '/my/submissions', { method: 'POST', body })
  setResponseStatus(event, 202)
  return result
})
