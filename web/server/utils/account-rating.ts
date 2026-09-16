import { parseAccountRating } from '~~/shared/utils/rating'

export const accountRating = defineCachedFunction(async (service: 'atcoder' | 'codeforces', handle: string) => {
  try {
    const url = service === 'atcoder'
      ? `https://atcoder.jp/users/${encodeURIComponent(handle)}/history/json`
      : `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`
    const data = await $fetch(url, { timeout: 4000, retry: 0, redirect: 'error' })
    return { rating: parseAccountRating(service, data), unavailable: false }
  } catch {
    return { rating: null, unavailable: true }
  }
}, { name: 'account-rating', maxAge: 300, getKey: (service, handle) => `${service}:${handle.toLowerCase()}` })
