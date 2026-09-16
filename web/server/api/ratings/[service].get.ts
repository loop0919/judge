import { accountRating } from '../../utils/account-rating'

export default defineEventHandler(async event => {
  const service = getRouterParam(event, 'service')
  const handle = getQuery(event).handle
  if ((service !== 'atcoder' && service !== 'codeforces') || typeof handle !== 'string'
    || !(service === 'atcoder' ? /^[A-Za-z0-9_]{1,16}$/ : /^[A-Za-z0-9_.-]{3,24}$/).test(handle)) {
    throw createError({ statusCode: 400 })
  }
  return accountRating(service, handle)
})
