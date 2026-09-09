import { expect, test } from './fixtures/account'

test('creation page has noindex and is linked from navigation', async ({ page, request }) => {
  const response = await request.get('/problems/new')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('name="robots" content="noindex, nofollow"')
  await page.goto('/')
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'マイページ' }).click()
  await page.getByRole('link', { name: '新しい問題を作成' }).click()
  await expect(page).toHaveTitle('問題を作成 | OpenOJ')
  await expect(page.getByLabel('問題のタイトル', { exact: true })).toBeEnabled()
})

test('editing, math preview, automatic save, and reload work together', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (/hydration/i.test(message.text())) errors.push(message.text()) })
  await page.goto('/problems/new')
  await page.getByLabel('問題のタイトル', { exact: true }).fill('数列の和')
  await page.locator('#time-limit').fill('3000')
  await page.locator('#memory-limit').fill('512')
  const body = '## 好きな構成\n\n合計は $a_1+a_2$ です。\n\n```input\n$N$\n$A_1 \\quad A_N$\n```\n\n```math\n\\sum_{i=1}^{N} A_i\n```\n\n```text\n$literal$\n```'
  await page.locator('#problem-source').fill(body)
  await expect(page.getByRole('region', { name: '問題のプレビュー' }).getByRole('heading', { name: '好きな構成' })).toBeVisible()
  await expect(page.locator('.preview-pane .input-format .katex')).toHaveCount(2)
  await expect(page.locator('.preview-pane .katex-display')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveText('保存済み')
  await page.reload()
  await expect(page.locator('#problem-title')).toHaveValue('数列の和')
  await expect(page.locator('#problem-source')).toHaveValue(body)
  await expect(page.locator('#time-limit')).toHaveAttribute('aria-valuenow', '3000')
  await expect(page.locator('#memory-limit')).toHaveAttribute('aria-valuenow', '512')
  expect(errors).toEqual([])
})

test('incomplete drafts remain saveable', async ({ page }) => {
  await page.goto('/problems/new')
  await expect(page.getByRole('button', { name: 'Markdown を保存', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('保存済み')
})

test('cache failures do not prevent DB saving', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
  })
  await page.goto('/problems/new')
  await page.locator('#problem-title').fill('保存できない問題')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('保存済み')
  await expect(page.locator('#problem-title')).toBeEnabled()
})

for (const width of [320, 375, 414, 768, 1280]) {
  test(`editor is usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/problems/new')
    await expect(page.locator('#problem-source')).toBeEnabled()
    const sidebar = page.getByRole('complementary', { name: '問題作成サイドバー' })
    const toggle = sidebar.getByRole('button', { name: /サイドバーを/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const collapsedWidth = (await sidebar.boundingBox())!.width
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect((await sidebar.boundingBox())!.width).toBeGreaterThan(collapsedWidth)
    await expect(sidebar.locator('.editor-sidebar-label').filter({ hasText: '問題文' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`sidebar-expanded-${width}.png`), fullPage: true })
    await sidebar.getByRole('button', { name: '問題管理', exact: true }).click()
    await expect(page.getByRole('heading', { name: '問題管理', exact: true })).toBeVisible()
    await sidebar.getByRole('button', { name: '問題文', exact: true }).click()
    await expect(page.locator('#problem-source')).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    for (const name of ['テストケース（準備中）', '解説（準備中）']) {
      const action = page.getByRole('button', { name, exact: true })
      await expect(action).toBeVisible()
      await expect(action).toBeDisabled()
      const bounds = await action.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    }
    await expect(page.getByRole('heading', { name: '問題を作成', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await page.locator('#problem-source').fill('## テスト\n')
    await page.getByRole('button', { name: '入力形式', exact: true }).click()
    await expect(page.locator('#problem-source')).toHaveValue(/```input/)
    if (width < 960) await page.getByRole('button', { name: 'プレビュー', exact: true }).click()
    await expect(page.locator('.preview-pane').getByRole('heading', { name: 'テスト', exact: true })).toBeVisible()
    await expect(page.locator('.preview-pane .input-format')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true })
  })
}

test('line numbers follow wrapped lines and scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/problems/new')
  const source = ['長い文章です。'.repeat(60), ...Array.from({ length: 70 }, (_, i) => `行 ${i}`)].join('\n')
  await page.locator('#problem-source').fill(source)
  await expect(page.locator('.source-line-number')).toHaveCount(71)
  const heights = await page.evaluate(() => ({
    source: document.querySelector('#problem-source')!.scrollHeight,
    mirror: document.querySelector('.source-line-mirror')!.getBoundingClientRect().height,
  }))
  expect(Math.abs(heights.source - heights.mirror)).toBeLessThan(3)
  await page.locator('#problem-source').evaluate(element => { element.scrollTop = 300; element.dispatchEvent(new Event('scroll')) })
  await expect(page.locator('.source-line-mirror')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -300)')
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
})
