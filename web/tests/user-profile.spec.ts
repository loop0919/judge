import { test, expect } from '@playwright/test'

test('public author and tester profiles are reachable without signing in', async ({ page }) => {
  await page.goto('/problems/11111111-1111-4111-8111-111111111111')
  await page.getByRole('link', { name: 'alice', exact: true }).click()
  await expect(page).toHaveURL(/\/users\/alice$/)
  await expect(page.getByRole('heading', { name: 'alice', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'A + B', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '公開済みの記事' }).click()
  await expect(page.getByRole('link', { name: '公開記事', exact: true })).toHaveAttribute('href', '/blog/77777777-7777-4777-8777-777777777777')
  await page.goto('/problems/11111111-1111-4111-8111-111111111111')
  await page.getByRole('link', { name: 'bob', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'bob', exact: true })).toBeVisible()
  await expect(page.getByText('公開された問題はまだありません。')).toBeVisible()
  await page.getByRole('button', { name: '公開済みの記事' }).click()
  await expect(page.getByText('公開された記事はまだありません。')).toBeVisible()
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: '/tmp/user-profile.png', fullPage: true })
  const response = await page.goto('/users/missing')
  expect(response?.status()).toBe(404)
})
