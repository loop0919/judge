import { privateAPI } from '../../../utils/private-api'
import { privateHeaders, requireSameOrigin } from '../../../utils/private-request'

export default defineEventHandler(async (event) => {
  privateHeaders(event)
  requireSameOrigin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id)) throw createError({ statusCode: 404 })
  await privateAPI(event, `/my/images/${id}`, { method: 'DELETE' })
  setResponseStatus(event, 204)
})
