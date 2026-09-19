import { privateAPI } from '../../../utils/private-api'
import { limitedJSON, privateHeaders, requireSameOrigin } from '../../../utils/private-request'

export default defineEventHandler(async (event) => {
  privateHeaders(event)
  if (event.method === 'GET') {
    const offset = String(getQuery(event).offset ?? '0')
    if (!/^\d{1,7}$/.test(offset)) throw createError({ statusCode: 400 })
    return privateAPI(event, `/my/images?offset=${offset}`)
  }
  if (event.method !== 'POST') throw createError({ statusCode: 405 })
  requireSameOrigin(event)
  return privateAPI(event, '/my/images', { method: 'POST', body: await limitedJSON(event, 720 * 1024) })
})
