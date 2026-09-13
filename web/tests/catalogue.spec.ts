import { expect, test } from './fixtures/account'

for (const [path, api, label] of [['/problems', 'problems', '問題'], ['/blog', 'posts', '記事']] as const) {
  test(`${label} table replaces pages, retains data on failure, and goes back`, async ({ page }, testInfo) => {
    const item = (id: string, title: string) => ({ id, title, author: 'alice', publishedAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z', publishedVersion: 1, isOperator: true, timeLimitMs: 2000, memoryLimitMb: 256, difficulty: 10, favoriteCount: 3 })
    let fail = true
    await page.route(`**/api/${api}*`, route => {
      if (new URL(route.request().url()).searchParams.has('cursor')) {
        if (fail) return route.fulfill({ status: 502, json: {} })
        return route.fulfill({ json: { items: [item('22222222-2222-4222-8222-222222222222', '2ページ目')], nextCursor: '' } })
      }
      return route.fulfill({ json: { items: [item('11111111-1111-4111-8111-111111111111', '1ページ目')], nextCursor: 'second' } })
    })
    await page.goto('/')
    await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(path)
    await expect(page).toHaveTitle(`${label} | ShareOJ`)
    const table = page.getByRole('table')
    await expect(table.getByRole('link', { name: '1ページ目' })).toBeVisible()
    if (api === 'problems') {
      await expect(table).toContainText('2 秒')
      await expect(table).toContainText('256 MiB')
      await expect(table).toContainText('Lv.10 · 金')
      await expect(table.getByRole('cell', { name: '3', exact: true })).toBeVisible()
    }
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width === 375 || width === 768) await page.screenshot({ path: testInfo.outputPath(`${api}-${width}.png`), fullPage: true })
    }
    const pager = page.getByRole('navigation', { name: 'ページネーション' })
    await expect(pager.getByRole('button', { name: '前へ' })).toBeDisabled()
    await pager.getByRole('button', { name: '次へ' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(table).toContainText('1ページ目')
    fail = false
    await pager.getByRole('button', { name: '次へ' }).click()
    await expect(table).toContainText('2ページ目')
    await expect(table).not.toContainText('1ページ目')
    await expect(pager.getByRole('button', { name: '次へ' })).toBeDisabled()
    await pager.getByRole('button', { name: '前へ' }).click()
    await expect(table).toContainText('1ページ目')
    await expect(table).not.toContainText('2ページ目')
  })
}

test('favorite status survives reload and a failed update preserves the count', async ({ page }) => {
  let favorited = false
  let fail = false
  await page.route('**/api/my/favorites/*', route => {
    if (route.request().method() === 'PUT') {
      if (fail) return route.fulfill({ status: 503, json: {} })
      favorited = route.request().postDataJSON().favorited
    }
    return route.fulfill({ json: { favorited, favoriteCount: favorited ? 1 : 0 } })
  })
  await page.goto('/problems/11111111-1111-4111-8111-111111111111')
  const button = page.getByRole('button', { name: /お気に入り/ })
  await expect(button).toBeEnabled()
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  fail = true
  await button.click()
  await expect(page.getByRole('alert')).toContainText('お気に入りを更新できませんでした')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(button).toContainText('1')
  fail = false
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(button).toContainText('0')
})
