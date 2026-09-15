import { z } from 'zod'
import { privateAPI, privateHeaders } from '../../utils/private-api'

const resultSchema = z.object({ items: z.array(z.string().uuid()) })
export default defineEventHandler(async event => {
  privateHeaders(event)
  const result = resultSchema.safeParse(await privateAPI(event, '/my/solved-problems'))
  if (!result.success) throw createError({ statusCode: 502 })
  return result.data
})
