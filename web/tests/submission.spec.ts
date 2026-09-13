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
  await page.getByRole('link', { name: 'A + B', exact: true }).click()
  await expect(language).toHaveValue('python314')
  await language.selectOption('cpp17')
  await page.reload()
  await expect(language).toHaveValue('cpp17')
})

test('unselected language disables both actions and survives reloads', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.goto(`/problems/${problemId}`)
  const language = page.getByRole('combobox', { name: '言語' })
  const submit = page.getByRole('button', { name: '提出する', exact: true })
  const sample = page.getByRole('button', { name: 'サンプル検証', exact: true })
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await language.selectOption({ label: '-- 未選択 --' })
  await expect(submit).toBeDisabled()
  await expect(sample).toBeDisabled()
  await language.selectOption('cpp17')
  await expect(submit).toBeEnabled()
  await expect(sample).toBeEnabled()
  await language.selectOption('')
  await page.reload()
  await expect(language).toHaveValue('')
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await expect(submit).toBeDisabled()
  await expect(sample).toBeDisabled()
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
  await page.route('**/api/my/favorites/*', route => route.fulfill({ status: 503, json: {} }))
  await page.route('**/api/my/submissions', route => route.fulfill({ status: 409, json: { data: { code: 'tests_not_ready' } } }))
  await page.goto(`/problems/${problemId}`)
  await page.getByLabel('ソースコード', { exact: true }).fill('int main(){}')
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'お気に入りを取得できませんでした。' })).toBeVisible()
  await expect(page.getByRole('region', { name: '提出', exact: true }).getByRole('alert')).toContainText('テストケース、検証コード、利用できる言語の設定を確認してください。')
  await expect(page.getByLabel('ソースコード', { exact: true })).toHaveText('int main(){}')
  await expect(page.getByLabel('ソースコード', { exact: true })).toBeEditable()
})


test('Sample validation polls inline and retains the source for a full submission', async ({ page }) => {
  await page.route('**/api/my/profile', route => route.fulfill({ json: { profile: { handle: 'alice', avatar: '', version: 1, createdAt: '2026-09-01T00:00:00Z' } } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  const item = { id: submissionId, problemId, problemVersion: 2, problemTitle: 'A + B', runtime: 'cpp17', status: 'QUEUED', result: null, createdAt: '2026-09-01T00:00:00Z' }
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/my/submissions', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ status: 202, json: { ...item, easyTest: requests.length === 1 } })
  })
  await page.route(`**/api/my/submissions/${submissionId}`, route => route.fulfill({ json: { ...item, status: 'DONE', result: { verdict: 'AC', passed: 1, total: 1, cases: [{ name: 'sample_1', verdict: 'AC', sampleDetails: { input: { text: '1 2\n', truncated: false }, expectedOutput: { text: '3\n', truncated: false }, actualOutput: { text: '7\n', truncated: false } } }] } } }))
  await page.goto(`/problems/${problemId}`)
  const source = page.getByLabel('ソースコード', { exact: true })
  await source.fill('int main(){}')
  const help = page.getByRole('button', { name: 'サンプル検証の説明', exact: true })
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'サンプルケースを検証する機能です。' })
  await expect(tooltip).toBeHidden()
  const helpBox = await help.boundingBox()
  const buttonBox = await page.getByRole('button', { name: 'サンプル検証', exact: true }).boundingBox()
  expect(helpBox!.width).toBe(20)
  expect(helpBox!.height).toBe(20)
  expect(Math.abs(helpBox!.y + helpBox!.height - buttonBox!.y - buttonBox!.height)).toBeLessThan(1)
  await help.hover()
  await expect(tooltip).toBeVisible()
  await source.hover()
  await expect(tooltip).toBeHidden()
  await help.focus()
  await expect(tooltip).toBeVisible()
  await page.getByRole('button', { name: 'サンプル検証', exact: true }).click()
  await expect(page.getByText('sample_1: AC', { exact: true })).toBeVisible()
  const details = page.locator('.sample-case')
  await expect(details.locator('dt')).toHaveText(['入力', '期待される出力', '実際の出力'])
  await expect(details.locator('pre')).toHaveText(['1 2\n', '3\n', '7\n'])
  await expect(page).toHaveURL(`/problems/${problemId}`)
  await expect(source).toHaveText('int main(){}')
  await expect(source).toBeEditable()
  await page.setViewportSize({ width: 375, height: 900 })
  await help.hover()
  await expect(tooltip).toBeVisible()
  const tooltipBox = await tooltip.boundingBox()
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(0)
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(375)
  await source.hover()
  expect(requests[0]).toEqual({ problemId, runtime: 'cpp17', source: 'int main(){}', easyTest: true })
  await page.getByRole('button', { name: '提出する', exact: true }).click()
  await expect(page).toHaveURL(`/my/submissions/${submissionId}`)
  expect(requests[1]).toEqual({ problemId, runtime: 'cpp17', source: 'int main(){}' })
})


test('Sample validation detail displays empty and truncated output safely', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
  await page.route('**/api/my/profile', route => route.fulfill({ json: { profile: { handle: 'alice', avatar: '', version: 1, createdAt: '2026-09-01T00:00:00Z' } } }))
  await page.route(`**/api/my/submissions/${submissionId}`, route => route.fulfill({ json: {
    id: submissionId, easyTest: true, problemId, problemVersion: 1, problemTitle: 'A + B', runtime: 'cpp17',
    status: 'DONE', createdAt: '2026-09-01T00:00:00Z', result: {
      verdict: 'WA', passed: 0, total: 1, cases: [{ name: 'sample_1', verdict: 'WA', sampleDetails: {
        input: { text: '<script>alert(1)</script>', truncated: false },
        expectedOutput: { text: '', truncated: false }, actualOutput: { text: 'partial', truncated: true },
      } }],
    },
  } }))
  await page.goto(`/my/submissions/${submissionId}`)
  await expect(page.getByRole('heading', { name: 'サンプル検証の結果', exact: true })).toBeVisible()
  const details = page.locator('.sample-case')
  await expect(details.locator('pre')).toHaveText(['<script>alert(1)</script>', 'partial'])
  await expect(details.getByText('（空）', { exact: true })).toBeVisible()
  await expect(details.getByText('長いため、先頭部分のみ表示しています。')).toBeVisible()
  await expect(details.locator('script')).toHaveCount(0)
})


for (const failed of [false, true]) {
  test(`Interactive sample displays diagnostics instead of output comparison (failed=${failed})`, async ({ page }) => {
    await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'alice' } } }))
    await page.route('**/api/my/profile', route => route.fulfill({ json: { profile: { handle: 'alice', avatar: '', version: 1, createdAt: '2026-09-01T00:00:00Z' } } }))
    await page.route(`**/api/my/submissions/${submissionId}`, route => route.fulfill({ json: {
      id: submissionId, easyTest: true, problemId, problemVersion: 1, problemTitle: 'Interactive', runtime: 'cpp17',
      status: 'DONE', createdAt: '2026-09-01T00:00:00Z', result: {
        interactive: true, verdict: failed ? 'JE' : 'AC', passed: failed ? 0 : 1, total: 1,
        checkerLog: '対話の診断',
        ...(failed ? {} : { cases: [{ name: 'sample_1', verdict: 'AC', checkerLog: { text: '対話判定: AC', truncated: false } }] }),
      },
    } }))
    await page.goto(`/my/submissions/${submissionId}`)
    await expect(page.getByRole('heading', { name: 'ジャッジコードの診断', exact: true })).toBeVisible()
    await expect(page.locator('pre').filter({ hasText: failed ? '対話の診断' : '対話判定: AC' })).toBeVisible()
    await expect(page.getByText('期待される出力', { exact: true })).toHaveCount(0)
    await expect(page.getByText('実際の出力', { exact: true })).toHaveCount(0)
    await expect(page.getByText('このケースの入出力は記録されていません。')).toHaveCount(0)
  })
}
