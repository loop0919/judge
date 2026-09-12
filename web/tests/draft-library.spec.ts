import { expect, test } from './fixtures/account'

test('multiple drafts remain independent and reopen from the library', async ({ page }) => {
  await page.goto('/my/problems')
  await expect(page.getByText('保存した問題はまだありません。')).toBeVisible()
  for (const title of ['最初の問題', '次の問題']) {
    await page.getByRole('link', { name: '新しい問題を作成' }).click()
    await page.locator('#problem-title').fill(title)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/problem=/)
    await page.getByRole('link', { name: 'ShareOJ ホーム', exact: true }).click()
  await page.getByRole('link', { name: 'マイページ', exact: true }).click()
  }
  await expect(page.locator('.draft-list li')).toHaveCount(2)
  await page.locator('.draft-list').getByRole('link', { name: /最初の問題/ }).click()
  await expect(page.locator('#problem-title')).toHaveValue('最初の問題')
  await page.locator('#problem-title').fill('最初の問題・改訂')
  await page.getByRole('link', { name: 'ShareOJ ホーム', exact: true }).click()
  await page.getByRole('button', { name: '保存して移動', exact: true }).click()
  await page.getByRole('link', { name: 'マイページ', exact: true }).click()
  await expect(page.locator('.draft-list li')).toHaveCount(2)
  await expect(page.locator('.draft-list li').first()).toContainText('最初の問題・改訂')
  await page.reload()
  await expect(page.locator('.draft-list li')).toHaveCount(2)
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
