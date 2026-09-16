import { test, expect } from '@playwright/test'
import { ratingColor, parseAccountRating } from '../shared/utils/rating'

test('rating colors follow each service at every boundary', () => {
  for (const [service, thresholds, colors] of [
    ['atcoder', [400, 800, 1200, 1600, 2000, 2400, 2800], ['gray', 'brown', 'green', 'cyan', 'blue', 'yellow', 'orange', 'red']],
    ['codeforces', [1200, 1400, 1600, 1900, 2100, 2400, 3000], ['gray', 'green', 'cyan', 'blue', 'violet', 'orange', 'red', 'legendary']],
  ] as const) {
    expect(ratingColor(service, null)).toBe('unrated')
    expect(ratingColor(service, 0)).toBe('gray')
    thresholds.forEach((threshold, index) => {
      expect(ratingColor(service, threshold - 1)).toBe(colors[index])
      expect(ratingColor(service, threshold)).toBe(colors[index + 1])
    })
  }
})

test('ratings distinguish unrated users from malformed or failed upstream responses', () => {
  expect(parseAccountRating('atcoder', [{ IsRated: true, NewRating: 1600 }, { IsRated: false, NewRating: 0 }])).toBe(1600)
  expect(parseAccountRating('atcoder', [])).toBeNull()
  expect(parseAccountRating('codeforces', { status: 'OK', result: [{}] })).toBeNull()
  expect(parseAccountRating('codeforces', { status: 'OK', result: [{ rating: 0 }] })).toBe(0)
  for (const value of [{}, { status: 'FAILED', result: [] }, { status: 'OK', result: [{ rating: '1600' }] }]) {
    expect(() => parseAccountRating('codeforces', value)).toThrow()
  }
  expect(() => parseAccountRating('atcoder', '<html>unavailable</html>')).toThrow()
})
