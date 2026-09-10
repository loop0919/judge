import { expect, test } from '@playwright/test'

const problemId = '11111111-1111-4111-8111-111111111111'
const submissionId = '22222222-2222-4222-8222-222222222222'

test('unauthenticated submission keeps the entered code', async ({ page }) => {
  await page.goto(`/problems/${problemId}`)
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('ログインしてください')
  await expect(page.getByLabel('ソースコード', { exact: true })).toHaveValue('int main(){}')
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
  await page.route(`**/api/my/submissions/${submissionId}`, route => route.fulfill({ json: ++reads === 1 ? item : { ...item, status: 'DONE', result: { verdict: 'AC', passed: 2, total: 2 } } }))
  await page.goto(`/problems/${problemId}`)
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page).toHaveURL(`/my/submissions/${submissionId}`)
  await expect(page.getByRole('status')).toHaveText('AC：正解')
  await expect(page.getByText('正解したケース：2 / 2')).toBeVisible()
})

test('unregistered tests explain why submission was rejected', async ({ page }) => {
  await page.route('**/api/my/submissions', route => route.fulfill({ status: 409, json: { data: { code: 'tests_not_ready' } } }))
  await page.goto(`/problems/${problemId}`)
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('採点用テストが登録されていません')
})
