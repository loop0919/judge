import { expect, test } from '@playwright/test'

const problemId = '11111111-1111-4111-8111-111111111111'
const submissionId = '22222222-2222-4222-8222-222222222222'

test('unauthenticated visitors see a login card instead of the submission form', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: null } }))
  await page.goto(`/problems/${problemId}`)
  await expect(page.getByRole('heading', { name: 'ログインして解答を提出' })).toBeVisible()
  await expect(page.getByLabel('ソースコード', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '言語' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '提出する', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'ログインする', exact: true }).click()
  await expect(page).toHaveURL('/login')
})

test('C++ submission opens its result and polls until completion', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.route('**/api/my/profile', route => route.fulfill({ json: { profile: { handle: 'alice', avatar: '', version: 1, createdAt: '2026-09-01T00:00:00Z' } } }))
  const item = { id: submissionId, problemId, problemVersion: 2, problemTitle: 'A + B', runtime: 'cpp17-local', source: 'int main(){}', status: 'QUEUED', result: null, createdAt: '2026-09-01T00:00:00Z' }
  await page.route('**/api/my/submissions', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ problemId, runtime: 'cpp17-local', source: 'int main(){}' })
    await route.fulfill({ status: 202, json: item })
  })
  let reads = 0
  await page.route(`**/api/my/submissions/${submissionId}`, route => route.fulfill({ json: ++reads === 1 ? item : { ...item, status: 'DONE', result: { verdict: 'AC', passed: 2, total: 2, cases: [{ name: 'sample', verdict: 'AC' }, { name: 'large', verdict: 'AC' }] } } }))
  await page.goto(`/problems/${problemId}`)
  await expect(page.getByRole('heading', { name: 'ログインして解答を提出' })).toBeHidden()
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await expect(page.getByText('12 / 65,536 bytes', { exact: true })).toBeVisible()
  const keyword = page.locator('.cm-line span').filter({ hasText: /^int$/ }).first()
  await expect(keyword).toBeVisible()
  expect(await keyword.evaluate(element => getComputedStyle(element).color !== getComputedStyle(element.closest('.cm-content')!).color)).toBe(true)
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page).toHaveURL(`/my/submissions/${submissionId}`)
  await expect(page.getByRole('status')).toHaveText('AC：正解')
  await expect(page.getByRole('row', { name: '正解したケース 2 / 2' })).toBeVisible()
  await expect(page.getByRole('row', { name: '問題の版', exact: false })).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'テストケースごとの結果' }).getByRole('row', { name: 'sample AC' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'テストケースごとの結果' }).getByRole('row', { name: 'large AC' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'ソースコード', exact: true })).toHaveAttribute('aria-readonly', 'true')
  await expect(page.getByRole('row', { name: 'コード長 12 bytes' })).toBeVisible()
  await page.getByRole('button', { name: '広げる', exact: true }).click()
  await expect(page.getByRole('button', { name: '折りたたむ' })).toHaveAttribute('aria-expanded', 'true')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'コピー', exact: true }).click()
  await expect(page.getByText('コピーしました。', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('int main(){}')
})

test('unregistered tests explain why submission was rejected', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.route('**/api/my/submissions', route => route.fulfill({ status: 409, json: { data: { code: 'tests_not_ready' } } }))
  await page.goto(`/problems/${problemId}`)
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('採点用テストが登録されていません')
  await expect(page.getByLabel('ソースコード', { exact: true })).toHaveText('int main(){}')
  await expect(page.getByLabel('ソースコード', { exact: true })).toBeEditable()
})
