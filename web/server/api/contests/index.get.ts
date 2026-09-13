import { publicContent } from '../../utils/public-content'
import type { ContestList } from '~~/shared/types/contest'
export default defineEventHandler(async event => {
  const offset = getQuery(event).offset
  return await publicContent(event, `/contests?offset=${encodeURIComponent(typeof offset === 'string' ? offset : '0')}`) as ContestList
})
