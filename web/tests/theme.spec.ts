import { expect, test } from './fixtures/account'
const problem = '/problems/11111111-1111-4111-8111-111111111111'

test('system tracking, persistent overrides, SSR and editor input survive theme changes', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (/hydration/i.test(message.text())) errors.push(message.text()) })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(problem)
  const themes = page.getByRole('group', { name: '配色', exact: true })
  const body = page.locator('body')
  const editor = page.getByLabel('ソースコード', { exact: true })
  await expect(themes.getByRole('button', { name: 'システム', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(body).toHaveCSS('background-color', 'rgb(21, 27, 35)')
  await editor.fill('int main() { return 42; }')
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(21, 27, 35)')
  await themes.getByRole('button', { name: 'ライト', exact: true }).click()
  await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(editor).toHaveText('int main() { return 42; }')
  await page.reload()
  await expect(themes.getByRole('button', { name: 'ライト', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await themes.getByRole('button', { name: 'ダーク', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expect(themes.getByRole('button', { name: 'ダーク', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(body).toHaveCSS('background-color', 'rgb(21, 27, 35)')
  expect(await (await page.request.get(problem)).text()).toContain('data-theme="dark"')
  await themes.getByRole('button', { name: 'システム', exact: true }).click()
  await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(body).toHaveCSS('background-color', 'rgb(21, 27, 35)')
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(21, 27, 35)')
  await page.reload()
  await expect(themes.getByRole('button', { name: 'システム', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})
for (const path of ['/', '/problems/new', '/blog/new']) {
  test(`mobile selector and navigation persistence: ${path}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.goto(path)
    const themes = page.getByRole('group', { name: '配色', exact: true })
    await themes.getByRole('button', { name: 'ダーク', exact: true }).click()
    const bounds = (await themes.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.screenshot({ path: testInfo.outputPath('dark-mobile.png'), fullPage: true })
    await page.goto('/login')
    await expect(themes.getByRole('button', { name: 'ダーク', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 27, 35)')
  })
}
test('invalid preference falls back to system', async ({ page, context }) => {
  await context.addCookies([{ name: 'openoj-theme', value: 'invalid', url: 'http://127.0.0.1:13000' }])
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'システム', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 27, 35)')
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`home animation colors follow theme changes: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion })
    await page.goto('/')
    const themes = page.getByRole('group', { name: '配色', exact: true })
    const home = page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'ホーム', exact: true })
    const themeBounds = (await themes.boundingBox())!
    expect(themeBounds.x + themeBounds.width).toBeLessThanOrEqual((await home.boundingBox())!.x)
    if (reducedMotion === 'no-preference') {
      await page.locator('.grid-dot').evaluateAll(dots => dots.forEach(dot => dot.getAnimations().forEach(animation => {
        animation.pause()
        animation.currentTime = Number(animation.effect!.getTiming().delay) + 330
      })))
      await themes.getByRole('button', { name: 'ダーク', exact: true }).click()
      await expect.poll(() => page.locator('.grid-dot').evaluateAll(dots => [...new Set(dots.map(dot => getComputedStyle(dot).fill))])).toEqual(['rgb(112, 219, 162)'])
      await themes.getByRole('button', { name: 'ライト', exact: true }).click()
      await expect.poll(() => page.locator('.grid-dot').evaluateAll(dots => [...new Set(dots.map(dot => getComputedStyle(dot).fill))])).toEqual(['rgb(24, 121, 78)'])
    }
    // Finish the initial reveal, including the staggered ripple on all 255 dots.
    await page.locator('.path-art').evaluate(svg => svg.getAnimations({ subtree: true }).forEach(animation => animation.finish()))
    for (const [label, line, accent] of [['ダーク', 'rgb(58, 72, 88)', 'rgb(112, 219, 162)'], ['ライト', 'rgb(220, 226, 232)', 'rgb(24, 121, 78)']]) {
      const button = themes.getByRole('button', { name: label, exact: true })
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => page.locator('.grid-dot').evaluateAll(dots => [...new Set(dots.map(dot => getComputedStyle(dot).fill))])).toEqual([line])
      await expect(page.locator('.route-node')).toHaveCSS('fill', accent!)
      await expect(page.locator('.start-node')).toHaveCSS('stroke', accent!)
    }
    await themes.getByRole('button', { name: 'システム', exact: true }).click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => page.locator('.grid-dot').evaluateAll(dots => [...new Set(dots.map(dot => getComputedStyle(dot).fill))])).toEqual(['rgb(58, 72, 88)'])
  })
}
