import { expect, test } from './fixtures/account'

test('multiple drafts remain independent and reopen from the library', async ({ page }) => {
  await page.goto('/my/problems')
  await expect(page.getByText('保存した問題はまだありません。')).toBeVisible()
  for (const title of ['最初の問題', '次の問題']) {
    await page.getByRole('main').getByRole('link', { name: '新規問題' }).click()
    await page.locator('#problem-title').fill(title)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/problem=/)
    await page.getByRole('link', { name: 'ShareOJ ホーム', exact: true }).click()
  await page.getByRole('link', { name: 'マイページ', exact: true }).click()
  }
  await expect(page.locator('.content-table tbody tr')).toHaveCount(2)
  await page.getByRole('link', { name: '最初の問題を編集' }).click()
  await expect(page.locator('#problem-title')).toHaveValue('最初の問題')
  await page.locator('#problem-title').fill('最初の問題・改訂')
  await page.getByRole('link', { name: 'ShareOJ ホーム', exact: true }).click()
  await page.getByRole('button', { name: '保存して移動', exact: true }).click()
  await page.getByRole('link', { name: 'マイページ', exact: true }).click()
  await expect(page.locator('.content-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.content-table tbody tr').first()).toContainText('最初の問題・改訂')
  await page.reload()
  await expect(page.locator('.content-table tbody tr')).toHaveCount(2)
})

for (const width of [320, 375, 414, 768, 1280]) {
  test(`draft library fits ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/my/problems')
    await expect(page.getByText('保存した問題はまだありません。')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`library-${width}.png`), fullPage: true })
  })
}

for (const width of [375, 1280]) {
  test(`content menu and table actions work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const id = '11111111-1111-4111-8111-111111111111'
    const draftId = '22222222-2222-4222-8222-222222222222'
    const updatedAt = '2026-09-10T00:00:00Z'
    await page.route('**/api/my/problems', route => route.fulfill({ json: { items: [
      { id, title: 'A + B', publishedVersion: 1, updatedAt },
      { id: draftId, title: '未公開の問題', publishedVersion: 0, updatedAt },
    ], nextCursor: '' } }))
    await page.route('**/api/my/posts', route => route.fulfill({ json: { items: [
      { id, title: '公開記事', publishedVersion: 1, publishedAt: updatedAt, updatedAt, isOperator: false },
      { id: draftId, title: '下書き記事', publishedVersion: 0, publishedAt: null, updatedAt, isOperator: false },
    ], nextCursor: '' } }))
    await page.route('**/api/my/submissions', route => route.fulfill({ json: { items: [] } }))
    await page.goto('/my')
    await expect(page.getByRole('table', { name: '自分の問題' })).toBeVisible()
    await expect(page.getByRole('table', { name: '作成した記事' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'A + Bを編集' })).toHaveAttribute('href', `/problems/new?problem=${id}`)
    await expect(page.getByRole('link', { name: '未公開の問題を閲覧' })).toHaveAttribute('href', `/problems/${draftId}`)
    await page.getByRole('button', { name: '記事', exact: true }).click()
    await expect(page.getByRole('button', { name: '記事', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('table', { name: '自分の問題' })).toBeHidden()
    await expect(page.getByRole('table', { name: '作成した記事' })).toBeVisible()
    await expect(page.getByRole('link', { name: '公開記事を編集' })).toHaveAttribute('href', `/blog/new?post=${id}`)
    await expect(page.getByRole('link', { name: '公開記事を閲覧' })).toHaveAttribute('href', `/blog/${id}`)
    await expect(page.getByRole('button', { name: '下書き記事を閲覧（公開すると閲覧できます）' })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '提出履歴', exact: true }).click()
    await expect(page).toHaveURL('/my?tab=submissions')
    await expect(page.getByRole('button', { name: '提出履歴', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: '提出履歴', exact: true })).toBeVisible()
    await expect(page.getByText('提出はまだありません。')).toBeVisible()
    await expect(page.getByRole('table', { name: '作成した記事' })).toBeHidden()
    await expect(page.getByRole('table', { name: '自分の問題' })).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '自分の問題', exact: true }).click()
    await expect(page.getByRole('heading', { name: '提出履歴', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'A + Bを閲覧' }).click()
    await expect(page).toHaveURL(`/problems/${id}`)
    await expect(page.getByRole('heading', { name: 'A + B', exact: true })).toBeVisible()
  })
}
