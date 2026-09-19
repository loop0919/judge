import { expect, test } from './fixtures/account'

for (const path of ['/problems/new', '/blog/new']) {
  test(`details can be inserted and toggled in ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(path)
    const source = page.locator('.markdown-source-editor .cm-content')
    await source.fill('')
    await page.getByRole('button', { name: '折りたたみ', exact: true }).click()
    await expect(source).toHaveText('\n:::details タイトル\n内容\n:::\n', { useInnerText: true })
    const details = page.locator('.markdown-body details')
    await expect(details.locator('p')).toBeHidden()
    await details.locator('summary').click()
    await expect(details.locator('p')).toBeVisible()
    await details.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(details.locator('p')).toBeHidden()
  })
}
