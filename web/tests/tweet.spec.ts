import { expect, test } from '@playwright/test'

const problemId = '11111111-1111-4111-8111-111111111111'
for (const path of [
  `/problems/${problemId}`, '/contests/88888888-8888-4888-8888-888888888888', '/contests/99999999-9999-4999-8999-999999999999',
  `/contests/88888888-8888-4888-8888-888888888888/problems/${problemId}`, '/blog/77777777-7777-4777-8777-777777777777',
  '/blog/markdown-guide', '/blog/generator-guide', '/blog/language-guide', '/blog/contest-rules',
]) {
  test(`Tweet shares the title, canonical URL and hashtag: ${path}`, async ({ page }) => {
    await page.goto(`${path}?ref=test#top`)
    const link = page.getByRole('link', { name: 'Xでシェア（新しいタブで開く）' })
    await expect(link).toBeVisible()
    const url = new URL((await link.getAttribute('href'))!)
    expect(url.origin + url.pathname).toBe('https://x.com/intent/tweet')
    expect(url.searchParams.get('text')).toBe(await page.getByRole('heading', { level: 1 }).textContent())
    expect(url.searchParams.get('url')).toBe(`https://judge.example${path}`)
    expect(url.searchParams.get('hashtags')).toBe('ShareOJ')
    await expect(link).toHaveAttribute('target', '_blank')
    // Intercept X so the check never sends a real request or publishes a post.
    await page.context().route('https://x.com/**', route => route.fulfill({ body: 'X compose' }))
    const popup = page.waitForEvent('popup')
    await link.click()
    await expect(await popup).toHaveURL(url.href)
  })
}

test('private and pre-start problems have no Tweet button', async ({ page, context }) => {
  await context.addCookies([{ name: 'openoj_access', value: 'valid-access', url: 'http://127.0.0.1:13000' }])
  for (const path of ['/problems/55555555-5555-4555-8555-555555555555', `/contests/99999999-9999-4999-8999-999999999999/problems/${problemId}`]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Xでシェア（新しいタブで開く）' })).toHaveCount(0)
    await context.clearCookies()
  }
})
