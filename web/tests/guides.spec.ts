import { expect, test } from '@playwright/test'

for (const [slug, codeBlocks, tables] of [['generator-guide', 3, 1], ['language-guide', 2, 9]] as const) {
  test(`${slug} renders Markdown, highlighted code and stable section links`, async ({ page, request }, testInfo) => {
    const path = `/blog/${slug}`
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('class="hljs-')
    await page.goto(path)
    const body = page.locator('article .markdown-body')
    await expect(body.locator('pre.highlighted-code')).toHaveCount(codeBlocks)
    await expect(body.locator('table')).toHaveCount(tables)
    for (const code of await body.locator('pre code').all()) {
      await expect(code).toHaveClass('language-cpp')
      expect(await code.locator('[class^="hljs-"]').count()).toBeGreaterThan(0)
      await expect(code).toContainText('#include')
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://judge.example${path}`)
    for (const link of await page.getByRole('navigation', { name: '記事の目次' }).getByRole('link').all()) {
      const target = (await link.getAttribute('href'))!
      await expect(page.locator(target)).toHaveCount(1)
      await link.click()
      await expect(page).toHaveURL(new RegExp(`${target}$`))
      await expect(page.locator(target)).toBeInViewport()
    }
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await body.locator('pre').first().scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`${slug}-${width}.png`) })
    }
  })
}
