import { z } from 'zod'
import { privateAPI } from '../../../../utils/private-api'
import { privateHeaders, requireSameOrigin } from '../../../../utils/private-request'
export default defineEventHandler(async event => {
  privateHeaders(event)
  requireSameOrigin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!z.string().uuid().safeParse(id).success) throw createError({ statusCode: 404 })
  return await privateAPI(event, `/my/notifications/${id}/read`, { method: 'POST' })
})
