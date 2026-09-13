import { expect, test } from './fixtures/account'

test('large test data renders only visible lines and names are unique', async ({ page }) => {
  await page.goto('/problems/new')
  await page.getByRole('button', { name: 'テストケース', exact: true }).click()
  await page.getByRole('button', { name: 'テストケースを追加' }).click()
  const input = page.getByLabel('入力', { exact: true })
  const content = Array.from({ length: 200_000 }, (_, i) => String(i)).join('\n')
  await page.locator('.test-data-editor input[type=file]').first().setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.from(content) })
  const scroller = page.locator('.test-data-editor').first().locator('.cm-scroller')
  await expect(page.locator('.test-data-editor').first().locator('.pane-heading span')).toContainText(`${Buffer.byteLength(content).toLocaleString('en-US')} / 16,777,216 bytes`)
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(input).toContainText('199999')
  expect(await page.locator('.test-data-editor').first().locator('.cm-line').count()).toBeLessThan(100)
  await input.fill('1\n2\n3')
  await expect(input.locator('.cm-line')).toHaveText(['1', '2', '3'])
  await expect(page.locator('.test-data-editor').first().locator('.pane-heading span')).toContainText('5 / 16,777,216 bytes')
  await page.getByLabel('テストケース名 1', { exact: true }).fill('sample')
  await page.getByRole('button', { name: 'テストケースを追加' }).click()
  await page.getByLabel('テストケース名 2', { exact: true }).fill('sample')
  await expect(page.locator('.test-case-editor [role="alert"]')).toContainText('重複')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('未保存の変更があります')
  await page.getByLabel('テストケース名 2', { exact: true }).fill('large')
  await expect(page.getByRole('status')).toHaveText('保存済み')
})

for (const width of [320, 375, 414, 768, 1280]) {
  test(`one file selection switches both editors at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/problems/new')
    await page.getByRole('button', { name: 'テストケース', exact: true }).click()
    await page.getByRole('button', { name: 'テストケースを追加' }).click()
    await page.getByLabel('テストケース名 1', { exact: true }).fill('sample.txt')
    await page.getByLabel('入力', { exact: true }).fill('3 5')
    await page.getByLabel('出力', { exact: true }).fill('8')
    await page.getByRole('button', { name: 'テストケースを追加' }).click()
    await page.getByLabel('テストケース名 2', { exact: true }).fill('large.txt')
    await page.getByLabel('入力', { exact: true }).fill('100 200')
    await page.getByLabel('出力', { exact: true }).fill('300')
    const files = page.getByRole('navigation', { name: 'テストケース一覧' })
    await files.getByRole('button', { name: 'sample.txt', exact: true }).click()
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('3 5')
    await expect(page.getByLabel('出力', { exact: true })).toHaveText('8')
    await expect(page.locator('.test-data-editor .cm-editor')).toHaveCount(2)
    await files.getByRole('button', { name: 'large.txt', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('100 200')
    await expect(page.getByLabel('出力', { exact: true })).toHaveText('300')
    await expect(files.getByRole('button', { name: 'large.txt', exact: true })).toHaveAttribute('aria-current', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`shared-files-${width}.png`), fullPage: true })
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'ケース2を削除' }).click()
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('3 5')
    await expect(page.getByLabel('出力', { exact: true })).toHaveText('8')
    await page.getByRole('button', { name: 'ケース1を削除' }).click()
    await expect(page.locator('.test-data-editor .cm-editor')).toHaveCount(0)
    await expect(page.getByText('テストケースを追加して、入力と期待出力を登録してください。')).toBeVisible()
  })
}

test('case limit stays at 100 when TL changes', async ({ page }) => {
  await page.goto('/problems/new')
  await page.locator('#time-limit').fill('5000')
  await page.getByRole('button', { name: 'テストケース', exact: true }).click()
  const add = page.getByRole('button', { name: 'テストケースを追加' })
  for (let i = 0; i < 100; i++) await add.click()
  await expect(add).toBeDisabled()
  await expect(page.locator('#test-cases-title')).toContainText('100 / 100件')
  await expect(page.getByRole('status')).toHaveText('保存済み')
  await page.getByRole('button', { name: '問題文', exact: true }).click()
  await page.locator('#time-limit').fill('100')
  await page.getByRole('button', { name: 'テストケース', exact: true }).click()
  await expect(add).toBeDisabled()
  await expect(page.locator('#test-cases-title')).toContainText('100 / 100件')
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'ケース1を削除' }).click()
  await expect(add).toBeEnabled()
  await expect(page.locator('.case-files li')).toHaveCount(99)
  await expect(page.getByRole('status')).toHaveText('保存済み')
})

test('500,000 ten-digit integers are stored as an immutable large test file', async ({ page }) => {
  const fileId = '33333333-3333-4333-8333-333333333333'
  const content = `500000\n${Array(500_000).fill('1000000000').join(' ')}\n`
  const size = Buffer.byteLength(content)
  expect(size).toBe(5_500_007)
  let digest = ''
  let uploaded = 0
  await page.route(/\/api\/my\/problems\/[^/]+\/test-files$/, async route => {
    const body = route.request().postDataJSON()
    digest = body.sha256
    expect(body.size).toBe(size)
    await route.fulfill({ json: { id: fileId, url: 'https://s3.example.test/file', headers: { 'content-type': 'text/plain; charset=utf-8', 'x-amz-checksum-sha256': digest, 'x-amz-tagging': 'status=pending' } } })
  })
  await page.route(new RegExp(`/api/my/problems/[^/]+/test-files/${fileId}/complete$`), route => route.fulfill({ json: { id: fileId, size, sha256: digest } }))
  await page.route(new RegExp(`/api/my/problems/[^/]+/test-files/${fileId}$`), route => route.fulfill({ json: { url: 'https://s3.example.test/file', size, sha256: digest } }))
  await page.route('https://s3.example.test/file', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,PUT' }
    if (route.request().method() === 'PUT') {
      uploaded = route.request().postDataBuffer()?.length ?? 0
      await route.fulfill({ status: 200, headers })
    } else {
      await route.fulfill({ status: 200, headers, body: Buffer.from(content) })
    }
  })
  await page.goto('/problems/new')
  await page.getByRole('button', { name: 'テストケース', exact: true }).click()
  await page.getByRole('button', { name: 'テストケースを追加' }).click()
  await page.locator('.test-data-editor input[type=file]').first().setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.from(content) })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('保存済み')
  expect(uploaded).toBe(size)
  expect(size).toBeLessThan(16 * 1024 * 1024)
  await page.reload()
  await page.getByRole('button', { name: 'テストケース', exact: true }).click()
  await expect(page.locator('.test-data-editor').first().locator('.pane-heading span')).toContainText(`${size.toLocaleString('en-US')} / 16,777,216 bytes`)
})

test('bulk folder import pairs names, persists data, and rejects invalid batches atomically', async ({ page }) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = await mkdtemp(join(tmpdir(), 'judge-cases-'))
  let batch = 0
  async function select(inputs: Record<string, string | Buffer>, outputs: Record<string, string | Buffer>) {
    for (const [label, files] of [['入力フォルダ', inputs], ['期待出力フォルダ', outputs]] as const) {
      const directory = join(root, String(batch++))
      await mkdir(directory)
      for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content)
      await page.getByLabel(label, { exact: true }).setInputFiles(directory)
    }
    await page.getByRole('button', { name: '一括追加', exact: true }).click()
  }
  try {
    await page.goto('/problems/new')
    await page.getByRole('button', { name: 'テストケース', exact: true }).click()
    await page.getByText('フォルダから一括追加', { exact: true }).click()
    await select({ 'sum.txt': '3 5\n', 'empty.txt': '' }, { 'empty.txt': '', 'sum.txt': '8\n' })
    await expect(page.locator('.case-files li')).toHaveCount(2)
    await page.getByRole('button', { name: 'sum.txt', exact: true }).click()
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('3 5')
    await expect(page.getByLabel('出力', { exact: true })).toHaveText('8')
    await expect(page.getByRole('status').filter({ hasText: /^保存済み$/ })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'テストケース', exact: true }).click()
    await expect(page.locator('.case-files li')).toHaveCount(2)
    await page.getByRole('button', { name: 'sum.txt', exact: true }).click()
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('3 5')
    await page.getByText('フォルダから一括追加', { exact: true }).click()
    const batches = [
      { inputs: { 'missing.txt': '1' }, outputs: { 'other.txt': '' }, error: '両方' },
      { inputs: { 'bad.txt': Buffer.from([0xff]) }, outputs: { 'bad.txt': '' }, error: 'UTF-8' },
      { inputs: { 'bad.txt': '\0' }, outputs: { 'bad.txt': '' }, error: '使用できない文字' },
      { inputs: { 'bad.csv': '' }, outputs: { 'bad.txt': '' }, error: '.txt' },
      { inputs: { 'big.txt': Buffer.alloc(16 * 1024 * 1024 + 1) }, outputs: { 'big.txt': '' }, error: '16 MiB' },
      { inputs: Object.fromEntries(Array.from({ length: 99 }, (_, i) => [`case${i}.txt`, ''])), outputs: Object.fromEntries(Array.from({ length: 99 }, (_, i) => [`case${i}.txt`, ''])), error: '100件' },
    ]
    for (const item of batches) {
      await select(item.inputs, item.outputs)
      await expect(page.locator('.test-case-editor [role=alert]')).toContainText(item.error)
      await expect(page.locator('.case-files li')).toHaveCount(2)
      await expect(page.getByLabel('入力', { exact: true })).toHaveText('3 5')
    }
    await select({ 'sum.txt': '9', 'next.txt': '2' }, { 'next.txt': '4', 'sum.txt': '18' })
    await expect(page.locator('.case-files li')).toHaveCount(3)
    await expect(page.locator('.test-case-editor [role=alert]')).toHaveCount(0)
    await page.getByRole('button', { name: 'sum.txt', exact: true }).click()
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('9')
    await expect(page.getByLabel('出力', { exact: true })).toHaveText('18')
    await expect(page.getByRole('status').filter({ hasText: /^保存済み$/ })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'テストケース', exact: true }).click()
    await expect(page.locator('.case-files li')).toHaveCount(3)
    await page.getByRole('button', { name: 'sum.txt', exact: true }).click()
    await expect(page.getByLabel('入力', { exact: true })).toHaveText('9')
    await expect(page.getByLabel('出力', { exact: true })).toHaveText('18')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('bulk overwrite preserves order, replaces stored files, and validates before mutation', async () => {
  const { importTestCases, mergeTestCases } = await import('../app/utils/import-test-cases')
  const file = (name: string, value = '') => new File([value], name)
  const storedFile = { id: '33333333-3333-4333-8333-333333333333', size: 16 << 20, sha256: 'a'.repeat(64) }
  const existing = Array.from({ length: 100 }, (_, i) => ({ name: `${i}.txt`, input: '', output: '', ...(i < 16 ? { inputFile: storedFile, outputFile: storedFile } : {}) }))
  const snapshot = JSON.stringify(existing)
  const imported = await importTestCases([file('0.txt', '9')], [file('0.txt', '18')], existing)
  const merged = mergeTestCases(existing, imported)
  expect(merged).toHaveLength(100)
  expect(merged[0]).toEqual({ name: '0.txt', input: '9', output: '18' })
  expect(merged.slice(1)).toEqual(existing.slice(1))
  await expect(importTestCases([file('0.txt', '\0')], [file('0.txt')], existing)).rejects.toThrow('使用できない文字')
  await expect(importTestCases([file('0.txt')], [file('other.txt')], existing)).rejects.toThrow()
  await expect(importTestCases([file('0.txt'), file('0.txt')], [file('0.txt')], existing)).rejects.toThrow('重複')
  expect(JSON.stringify(existing)).toBe(snapshot)
})
