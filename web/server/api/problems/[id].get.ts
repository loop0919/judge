import { publicProblemSchema } from '~~/shared/types/problem'
import { publicContent } from '../../utils/public-content'
import { accountProblemSchema } from '../../../app/utils/account-problems'
import { profileResultSchema } from '../../../app/utils/profile'
import { hasSession, privateAPI, privateHeaders } from '../../utils/private-api'
export default defineEventHandler(async event => {
  privateHeaders(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[a-f0-9-]{36}$/.test(id)) throw createError({ statusCode: 404 })
  let content: unknown
  try { content = await publicContent(event, `/problems/${id}`) }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404 || !hasSession(event)) throw error
    let saved: unknown
    try { saved = await privateAPI(event, `/my/problems/${id}`) }
    catch (privateError) {
      if ([401, 403, 404].includes((privateError as { statusCode?: number }).statusCode ?? 0)) throw error
      throw privateError
    }
    const parsed = accountProblemSchema.safeParse(saved)
    if (!parsed.success || parsed.data.id !== id) throw createError({ statusCode: 502 })
    const { draft } = parsed.data
    const author = profileResultSchema.safeParse(await privateAPI(event, '/my/profile'))
    if (!author.success) throw createError({ statusCode: 502 })
    return {
      id, title: draft.title.trim() || '無題の問題', markdown: draft.markdown, editorial: draft.editorial,
      timeLimitMs: Number(draft.timeLimitMs), memoryLimitMb: Number(draft.memoryLimitMb),
      author: author.data.profile?.handle ?? '', isPrivate: true, specialJudge: draft.checker !== null,
    }
  }
  const result = publicProblemSchema.safeParse(content)
  if (!result.success || result.data.id !== id) throw createError({ statusCode: 502 })
  return { ...result.data, isPrivate: false }
})
