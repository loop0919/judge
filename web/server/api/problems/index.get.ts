import { publicProblemListSchema } from '~~/shared/types/problem'
import { publicContent, publicCursor } from '../../utils/public-content'
export default defineEventHandler(async event => {
  const result = publicProblemListSchema.safeParse(await publicContent(event, `/problems${publicCursor(event)}`))
  if (!result.success) throw createError({ statusCode: 502 })
  return result.data
})
