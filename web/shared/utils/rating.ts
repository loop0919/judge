import { z } from 'zod'

// https://info.atcoder.jp/overview/contest/rating
// https://codeforces.com/blog/entry/20638
export function ratingColor(service: 'atcoder' | 'codeforces', rating: number | null) {
  if (rating === null) return 'unrated'
  const thresholds = service === 'atcoder'
    ? [400, 800, 1200, 1600, 2000, 2400, 2800]
    : [1200, 1400, 1600, 1900, 2100, 2400, 3000]
  const colors = service === 'atcoder'
    ? ['gray', 'brown', 'green', 'cyan', 'blue', 'yellow', 'orange', 'red']
    : ['gray', 'green', 'cyan', 'blue', 'violet', 'orange', 'red', 'legendary']
  const index = thresholds.findIndex(limit => rating < limit)
  return colors[index === -1 ? thresholds.length : index]
}

const rating = z.number().int()
export function parseAccountRating(service: 'atcoder' | 'codeforces', data: unknown): number | null {
  if (service === 'atcoder') {
    const history = z.array(z.object({ IsRated: z.boolean(), NewRating: rating })).parse(data)
    return history.filter(contest => contest.IsRated).at(-1)?.NewRating ?? null
  }
  const response = z.object({ status: z.literal('OK'), result: z.array(z.object({ rating: rating.optional() })).length(1) }).parse(data)
  return response.result[0]?.rating ?? null
}

