import { notificationsSchema } from '~~/shared/types/notification'
import { privateAPI } from '../../../utils/private-api'
import { privateHeaders, requireSameOrigin } from '../../../utils/private-request'
export default defineEventHandler(async event => {
  privateHeaders(event)
  requireSameOrigin(event)
  const result = notificationsSchema.safeParse(await privateAPI(event, '/my/notifications/read', { method: 'POST' }))
  if (!result.success) throw createError({ statusCode: 502 })
  return result.data
})
