import { expect, test } from './fixtures/account'

test('posting selects only unpublished standalone problems across pages and handles failures', async ({ page }) => {
  await page.goto('/problems/new')
  await page.locator('#problem-title').fill('投稿する下書き')
  await page.locator('#problem-source').fill('問題本文')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/problem=/)
  await expect(page.getByRole('status')).toHaveText('保存済み')
  const id = new URL(page.url()).searchParams.get('problem')!
  await page.getByRole('button', { name: '問題管理', exact: true }).click()
  await expect(page.getByRole('button', { name: '公開する', exact: true })).toHaveCount(0)
  const updatedAt = '2026-09-10T00:00:00Z'
  await page.route('**/api/my/problems?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('cursor') ? {
    items: [{ id, title: '投稿する下書き', publishedVersion: 0, updatedAt }], nextCursor: '',
  } : {
    items: [
      { id: '11111111-1111-4111-8111-111111111111', title: '公開済み', publishedVersion: 1, updatedAt },
      { id: '22222222-2222-4222-8222-222222222222', title: 'コンテスト用', contestId: 'contest', publishedVersion: 0, updatedAt },
    ], nextCursor: 'next',
  } }))
  let attempts = 0
  await page.route(`**/api/my/problems/${id}/publication`, route => {
    expect(route.request().postDataJSON()).toMatchObject({ publish: true, version: expect.any(Number) })
    attempts++
    return route.fulfill(attempts === 1 ? { status: 409, json: {} } : { json: {} })
  })
  await page.goto('/problems')
  await page.getByRole('link', { name: '投稿', exact: true }).click()
  const select = page.getByLabel('投稿する問題')
  await expect(select.locator('option')).toHaveText(['問題を選択してください', '投稿する下書き'])
  await expect(page.getByRole('button', { name: '投稿', exact: true })).toBeDisabled()
  await select.selectOption(id)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '投稿', exact: true }).click()
  expect(attempts).toBe(0)
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '投稿', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('別の画面で更新されています')
  await page.getByRole('button', { name: '投稿', exact: true }).click()
  await expect(page).toHaveURL(`/problems/${id}`)
})

test('posting has an empty state', async ({ page }) => {
  await page.goto('/problems/post')
  await expect(page.getByText('投稿できる未公開の問題はありません。')).toBeVisible()
  await expect(page.getByRole('link', { name: '新規問題を作成' })).toBeVisible()
})
