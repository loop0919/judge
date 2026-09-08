import { expect, test } from '@playwright/test'

test('initial HTTP response includes the problem and SEO metadata', async ({ request }) => {
  const response = await request.get('/problems/a-plus-b?ref=test')
  expect(response.status()).toBe(200)
  const html = await response.text()
  // Ignore script contents: serialized hydration data is not SSR content.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  expect(markup).toMatch(/<html\s+lang="ja"/)
  expect(markup).toContain('<title>A + B | OpenOJ</title>')
  expect(markup).toContain('name="description"')
  expect(markup).toContain('property="og:title"')
  expect(markup).toContain('rel="canonical" href="https://judge.example/problems/a-plus-b"')
  expect(markup).toContain('2 つの整数 ')
  expect(markup).toContain('class="katex"')
  expect(markup).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"')
  expect(markup).not.toContain('$A$')
  expect(markup).toContain('2000000000')
  expect(html).not.toContain('127.0.0.1:18080')
})

test('problem is readable with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:13000/problems/a-plus-b')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A + B')
  await expect(page.getByRole('heading', { name: '制約', exact: true })).toBeVisible()
  await expect(page.locator('#samples .katex').first()).toBeVisible()
  await expect(page.locator('#constraints .katex')).toHaveCount(2)
  await expect(page.locator('#samples pre').first()).toHaveText('3 5\n')
  await page.getByRole('navigation', { name: 'この問題の目次' }).getByRole('link', { name: '入出力例' }).click()
  await expect(page).toHaveURL(/#samples$/)
  await context.close()
})

test('client navigation and hydration work without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || /hydration/i.test(message.text())) errors.push(message.text())
  })
  await page.goto('/')
  await page.locator('.problem-row').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A + B')
  await expect(page).toHaveTitle('A + B | OpenOJ')
  await page.locator('.breadcrumb').getByRole('link', { name: '公開問題' }).click()
  await expect(page).toHaveTitle('公開問題 | OpenOJ')
  expect(errors).toEqual([])
})

for (const path of ['/problems/missing', '/problems/INVALID', '/unknown-page']) {
  test(`missing page returns a real 404 and noindex: ${path}`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(404)
    const html = await response.text()
    expect(html).toContain('ページが見つかりません')
    expect(html).toContain('name="robots" content="noindex, nofollow"')
  })
}

for (const id of ['unavailable', 'invalid-body']) {
  test(`upstream failures return 502 rather than a successful empty page: ${id}`, async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:13001/problems/${id}`)
    expect(response.status()).toBe(502)
    const html = await response.text()
    expect(html).toContain('問題を取得できませんでした')
    expect(html).toContain('name="robots" content="noindex, nofollow"')
    expect(html).not.toContain('private-upstream-diagnostic')
  })
}

for (const width of [320, 375, 414, 768, 1280]) {
  test(`problem layout fits ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/problems/a-plus-b')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A + B')
    const overflow = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth
      return [...document.querySelectorAll('body *')].filter(element => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && (rect.right > viewport + 1 || rect.left < -1)
      }).map(element => element.tagName + '.' + element.className)
    })
    expect(overflow).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`problem-${width}.png`), fullPage: true })
  })
}
