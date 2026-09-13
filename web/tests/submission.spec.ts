import { expect, test } from '@playwright/test'

const problemId = '11111111-1111-4111-8111-111111111111'
const submissionId = '22222222-2222-4222-8222-222222222222'

test('language selection survives reloads and returning to the problem', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.goto(`/problems/${problemId}`)
  const language = page.getByRole('combobox', { name: '言語' })
  await expect(language).toHaveValue('cpp17')
  await language.selectOption('python314')
  await page.reload()
  await expect(language).toHaveValue('python314')
  await page.goto('/problems')
  await page.getByRole('link', { name: 'A + B alice', exact: true }).click()
  await expect(language).toHaveValue('python314')
  await language.selectOption('cpp17')
  await page.reload()
  await expect(language).toHaveValue('cpp17')
})

test('an unavailable saved language falls back to the default', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.addInitScript(() => localStorage.setItem('openoj.submission-runtime', 'removed-runtime'))
  await page.goto(`/problems/${problemId}`)
  await expect(page.getByRole('combobox', { name: '言語' })).toHaveValue('cpp17')
})

test('language selection works when browser storage is disabled', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
  })
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  await page.goto(`/problems/${problemId}`)
  const language = page.getByRole('combobox', { name: '言語' })
  await expect(language).toHaveValue('cpp17')
  await language.selectOption('python314')
  await expect(language).toHaveValue('python314')
  expect(errors).toEqual([])
})

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
    expect(route.request().postDataJSON()).toEqual({ problemId, runtime: 'cpp17', source: 'int main(){}' })
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

for (const view of ['detail', 'history']) {
  test(`${view} displays actual preparation and case progress, then stops polling`, async ({ page }) => {
    await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
    await page.route('**/api/my/profile', route => route.fulfill({ json: { profile: { handle: 'alice', avatar: '', version: 1, createdAt: '2026-09-01T00:00:00Z' } } }))
    const item = { id: submissionId, problemId, problemVersion: 2, problemTitle: 'A + B', runtime: 'python314-isolate', source: 'print(3)', status: 'QUEUED', result: null, createdAt: '2026-09-01T00:00:00Z' }
    const states = [item,
      { ...item, status: 'RUNNING', progress: { phase: 'PREPARING', completed: 0, total: 4 } },
      { ...item, status: 'RUNNING', progress: { phase: 'JUDGING', completed: 0, total: 4 } },
      { ...item, status: 'RUNNING', progress: { phase: 'JUDGING', completed: 2, total: 4 } },
      { ...item, status: 'DONE', progress: null, result: { verdict: 'AC', passed: 4, total: 4 } },
    ]
    let reads = 0
    const endpoint = `/api/my/submissions${view === 'detail' ? `/${submissionId}` : ''}`
    await page.route(`**${endpoint}`, route => {
      const state = states[Math.min(reads++, states.length - 1)]
      return route.fulfill({ json: view === 'detail' ? state : { items: [state] } })
    })
    await page.goto(`/my/submissions${view === 'detail' ? `/${submissionId}` : ''}`)
    const badge = page.locator('.verdict-badge').first()
    await expect(badge).toHaveText('WJ')
    await expect(badge.locator('.judge-spinner')).toBeVisible()
    await badge.focus()
    await expect(page.getByRole('tooltip')).toHaveText('ジャッジ中')
    await expect(badge).toHaveAccessibleDescription('ジャッジ中')
    for (const [index, label] of ['WJ', 'WJ', '0/4', '2/4', 'AC'].entries()) {
      await expect.poll(() => reads).toBeGreaterThanOrEqual(index + 1)
      await expect(badge).toHaveText(label)
    }
    await expect(badge.locator('.judge-spinner')).toHaveCount(0)
    await page.clock.install()
    await page.clock.fastForward(6000)
    expect(reads).toBe(5)
  })
}

test('unready judging settings explain why submission was rejected', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.route('**/api/my/submissions', route => route.fulfill({ status: 409, json: { data: { code: 'tests_not_ready' } } }))
  await page.goto(`/problems/${problemId}`)
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('テストケース、検証コード、利用できる言語の設定を確認してください。')
  await expect(page.getByLabel('ソースコード', { exact: true })).toHaveText('int main(){}')
  await expect(page.getByLabel('ソースコード', { exact: true })).toBeEditable()
})


test('Easy Test polls inline and retains the source for a full submission', async ({ page }) => {
  await page.route('**/api/my/profile', route => route.fulfill({ json: { profile: { handle: 'alice', avatar: '', version: 1, createdAt: '2026-09-01T00:00:00Z' } } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  const item = { id: submissionId, problemId, problemVersion: 2, problemTitle: 'A + B', runtime: 'cpp17', status: 'QUEUED', result: null, createdAt: '2026-09-01T00:00:00Z' }
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/my/submissions', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ status: 202, json: { ...item, easyTest: requests.length === 1 } })
  })
  await page.route(`**/api/my/submissions/${submissionId}`, route => route.fulfill({ json: { ...item, status: 'DONE', result: { verdict: 'AC', passed: 1, total: 1, cases: [{ name: 'sample_1', verdict: 'AC' }] } } }))
  await page.goto(`/problems/${problemId}`)
  const source = page.getByLabel('ソースコード', { exact: true })
  await source.fill('int main(){}')
  await page.getByRole('button', { name: 'Easy Test', exact: true }).click()
  await expect(page.getByText('sample_1: AC', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(`/problems/${problemId}`)
  await expect(source).toHaveText('int main(){}')
  await expect(source).toBeEditable()
  expect(requests[0]).toEqual({ problemId, runtime: 'cpp17', source: 'int main(){}', easyTest: true })
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page).toHaveURL(`/my/submissions/${submissionId}`)
  expect(requests[1]).toEqual({ problemId, runtime: 'cpp17', source: 'int main(){}' })
})
