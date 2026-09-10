import { privateAPI, privateHeaders, sessionCookie } from '../../../utils/private-api'
import type { Submission } from '../../../../shared/types/submission'

export default defineEventHandler(async event => {
  privateHeaders(event)
  if (!getCookie(event, sessionCookie)) throw createError({ statusCode: 401 })
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw createError({ statusCode: 404 })
  return privateAPI<Submission>(event, `/my/submissions/${id}`)
})
