import { expect, test } from './fixtures/account'

const message = 'ジャッジ機能のメンテナンスを行っています。この期間中は提出等ができません。'
const problem = '/problems/11111111-1111-4111-8111-111111111111'
const items = [{ id: 'cpp17', label: 'C++17 (GCC)' }]

test('maintenance disables judging on an open page and preserves the source through recovery', async ({ page }) => {
  await page.clock.install()
  await page.goto(problem)
  const source = page.getByLabel('ソースコード', { exact: true })
  await source.fill('int main(){}')
  const submit = page.getByRole('button', { name: '提出する', exact: true })
  await expect(submit).toBeEnabled()
  let maintenance = true
  await page.route('**/api/runtimes', route => route.fulfill({ json: { items: maintenance ? [] : items, maintenance } }))
  await page.clock.fastForward(30_000)
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await expect(submit).toBeDisabled()
  await expect(page.getByRole('button', { name: 'サンプル検証', exact: true })).toBeDisabled()
  await expect(source).toHaveText('int main(){}')
  maintenance = false
  await page.clock.fastForward(30_000)
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  await expect(source).toHaveText('int main(){}')
  await page.getByRole('combobox', { name: '言語' }).selectOption('cpp17')
  await expect(submit).toBeEnabled()
  await page.route('**/api/runtimes', route => route.fulfill({ status: 502, json: {} }))
  await page.clock.fastForward(30_000)
  await expect(page.getByText('ジャッジ機能の状態を確認できません。現在、提出等を利用できません。', { exact: true })).toBeVisible()
  await expect(submit).toBeDisabled()
})

test('a maintenance rejection refreshes the banner without discarding input', async ({ page }) => {
  await page.goto(problem)
  const source = page.getByLabel('ソースコード', { exact: true })
  await source.fill('int main(){}')
  await page.route('**/api/runtimes', route => route.fulfill({ json: { items: [], maintenance: true } }))
  await page.route('**/api/my/submissions', route => route.fulfill({ status: 503, json: { data: { code: 'judge_maintenance' } } }))
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page.locator('.judge-banner')).toHaveText(message)
  await expect(source).toHaveText('int main(){}')
})

test('the banner remains visible in the mobile editor while drafts can still be edited', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/runtimes', route => route.fulfill({ json: { items: [], maintenance: true } }))
  await page.goto('/problems/new?fresh=1')
  await expect(page.locator('.judge-banner')).toHaveText(message)
  const bounds = await page.locator('.judge-banner').boundingBox()
  expect(bounds?.y).toBe(0)
  expect(bounds?.width).toBeLessThanOrEqual(390)
  await expect(page.getByRole('textbox', { name: '問題のタイトル' })).toBeEditable()
})
