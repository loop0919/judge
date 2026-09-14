import { z } from 'zod'
import { publicContent } from '../utils/public-content'

const catalog = z.object({ items: z.array(z.object({ id: z.string(), label: z.string() })), maintenance: z.boolean().default(false) })
export default defineEventHandler(async event => {
  const result = catalog.safeParse(await publicContent(event, '/runtimes'))
  if (!result.success) throw createError({ statusCode: 502 })
  return result.data
})
