import { expect, test } from '@playwright/test'
import { activeDraftKey, draftPrefix } from '../app/utils/draft-library'
import { draftStorageKey, initialProblemMarkdown } from '../app/utils/problem-draft'

const draft = { title: '削除対象', markdown: initialProblemMarkdown, timeLimitMs: '2000', memoryLimitMb: '256' }

test('deleting a legacy draft retains other problems and cannot migrate back', async ({ page }) => {
  await page.goto('/my/problems')
  await page.evaluate(({ draft, draftStorageKey, draftPrefix }) => {
    localStorage.setItem(draftStorageKey, JSON.stringify({ version: 1, draft }))
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem(draftPrefix + id, JSON.stringify({ version: 2, id, updatedAt: new Date().toISOString(), draft: { ...draft, title: '残す問題' } }))
  }, { draft, draftStorageKey, draftPrefix })
  await page.goto('/my/problems')
  await page.locator('.draft-list').getByRole('link', { name: /削除対象/ }).click()
  await page.getByRole('button', { name: '問題管理', exact: true }).click()
  await page.getByRole('button', { name: '問題を削除', exact: true }).click()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page.getByRole('heading', { name: '問題管理', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '問題文', exact: true }).click()
  await expect(page.locator('#problem-title')).toHaveValue('削除対象')
  await page.locator('#problem-title').fill('未保存の変更も削除')
  await page.getByRole('button', { name: '問題管理', exact: true }).click()
  await page.getByRole('button', { name: '問題を削除', exact: true }).click()
  await page.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page).toHaveURL('/my/problems')
  await expect(page.locator('.draft-list li')).toHaveCount(1)
  await expect(page.locator('.draft-list')).toContainText('残す問題')
  await page.reload()
  await expect(page.locator('.draft-list li')).toHaveCount(1)
  expect(await page.evaluate(({ draftStorageKey, activeDraftKey }) => [localStorage.getItem(draftStorageKey), localStorage.getItem(activeDraftKey)], { draftStorageKey, activeDraftKey })).toEqual([null, null])
})

test('failed deletion keeps the problem and the dialog open', async ({ page }) => {
  await page.goto('/problems/new?fresh=1')
  await page.locator('#problem-title').fill('残る下書き')
  await page.getByRole('button', { name: '下書きを保存', exact: true }).click()
  await expect(page).toHaveURL(/draft=/)
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new Error('Denied') } })
  await page.getByRole('button', { name: '問題管理', exact: true }).click()
  await page.getByRole('button', { name: '問題を削除', exact: true }).click()
  await page.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('削除できませんでした')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page.getByRole('heading', { name: '問題管理', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '問題文', exact: true }).click()
  await expect(page.locator('#problem-title')).toHaveValue('残る下書き')
})

for (const width of [320, 375, 414, 768, 1280]) {
  test(`management replaces the workspace at ${width}px and preserves editing`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/problems/new?fresh=1')
    await page.locator('#problem-title').fill('管理画面へ切り替え')
    await page.locator('#problem-source').fill('## 書きかけの本文\n\n$A+B$')
    await page.getByRole('button', { name: '問題管理', exact: true }).click()
    await expect(page.getByRole('heading', { name: '問題管理', exact: true })).toBeVisible()
    await expect(page.locator('#problem-source')).toBeHidden()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '問題管理', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`management-${width}.png`) })
    await page.getByRole('button', { name: '問題文', exact: true }).click()
    await expect(page.locator('#problem-title')).toHaveValue('管理画面へ切り替え')
    await expect(page.locator('#problem-source')).toHaveValue('## 書きかけの本文\n\n$A+B$')
  })
}
