import { publicProblemSchema } from '~~/shared/types/problem'
import { publicContent } from '../../utils/public-content'
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id)) throw createError({ statusCode: 404 })
  const result = publicProblemSchema.safeParse(await publicContent(event, `/problems/${id}`))
  if (!result.success || result.data.id !== id) throw createError({ statusCode: 502 })
  return result.data
})
