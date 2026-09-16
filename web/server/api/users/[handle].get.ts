import { z } from 'zod'
import { accountsSchema } from '~~/shared/types/profile'
import { publicContent } from '../../utils/public-content'

export default defineEventHandler(async event => {
  const handle = getRouterParam(event, 'handle') ?? ''
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(handle)) throw createError({ statusCode: 404 })
  const result = z.object({
    accounts: accountsSchema.prefault({}), handle: z.string(), avatar: z.string(), createdAt: z.string().datetime({ offset: true }),
  }).safeParse(await publicContent(event, `/users/${handle}`))
  if (!result.success) throw createError({ statusCode: 502 })
  return result.data
})
