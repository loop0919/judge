import { postListSchema } from '~~/shared/types/post'
import { publicContent, publicCursor } from '../../utils/public-content'
export default defineEventHandler(async event => {
  const result = postListSchema.safeParse(await publicContent(event, `/posts${publicCursor(event)}`))
  if (!result.success) throw createError({ statusCode: 502 })
  return result.data
})
