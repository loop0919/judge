import { expect, test } from './fixtures/account'

for (const width of [375, 1280]) {
  test(`blog editor follows the problem workspace at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/blog/new')
    await page.getByLabel('タイトル', { exact: true }).fill('記事のタイトル')
    await page.getByLabel('本文（Markdown）').fill('## 本文\n$x^2$')
    await expect(page.locator('.site-shell--editor')).toBeVisible()
    await expect(page.getByRole('button', { name: /テストケース|解説|入力形式/ })).toHaveCount(0)
    await expect(page.getByText('実行時間制限', { exact: true })).toHaveCount(0)
    await expect(page.getByText('メモリ制限', { exact: true })).toHaveCount(0)
    if (width >= 960) {
      await expect(page.getByRole('button', { name: '分割', exact: true })).toHaveAttribute('aria-pressed', 'true')
      const separator = page.getByRole('separator')
      await separator.focus()
      await page.keyboard.press('ArrowRight')
      await expect(separator).toHaveAttribute('aria-valuenow', '52')
    } else {
      await page.getByRole('button', { name: 'プレビュー', exact: true }).click()
    }
    await expect(page.locator('.post-preview .katex')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`blog-editor-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '記事管理', exact: true }).click()
    await expect(page.getByRole('heading', { name: '公開設定' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /テスター|リジャッジ|テストケース/ })).toHaveCount(0)
    await page.getByRole('button', { name: '本文', exact: true }).click()
    await page.getByRole('button', { name: '編集', exact: true }).click()
    await page.getByRole('button', { name: '太字', exact: true }).click()
    await expect(page.getByLabel('本文（Markdown）')).toHaveValue(/\*\*強調\*\*/)
  })
}
