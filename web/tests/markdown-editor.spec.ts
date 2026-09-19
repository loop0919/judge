import { expect, test } from './fixtures/account'

for (const [path, selector] of [
  ['/problems/new', '#problem-source'],
  ['/blog/new', '#post-body'],
  ['/my/contests/new', '#contest-description'],
]) {
  test(`Markdown list continuation, exit, and undo work in ${path}`, async ({ page }) => {
    await page.goto(path!)
    const editor = page.locator(selector!)
    await expect(editor).toBeEditable()
    for (const [text, marker] of [
      ['- item', '- '], ['* item', '* '], ['+ item', '+ '],
      ['1. item', '2. '], ['- [x] done', '- [ ] '], ['> quote', '> '],
      ['- parent\n  - child', '  - '],
    ]) {
      await editor.fill(text!)
      await editor.press('ControlOrMeta+End')
      await editor.press('Enter')
      await expect.poll(() => editor.locator('.cm-line').allTextContents()).toEqual([...text!.split('\n'), marker])
    }
    await editor.fill('- item')
    await editor.press('End')
    await editor.press('Enter')
    await editor.press('Enter')
    await expect.poll(() => editor.locator('.cm-line').allTextContents()).toEqual(['- item', ''])
    await editor.press('ControlOrMeta+z')
    await expect.poll(() => editor.locator('.cm-line').allTextContents()).toEqual(['- item', '- '])
    await editor.fill('- ')
    await editor.press('End')
    const ime = await page.context().newCDPSession(page)
    await ime.send('Input.imeSetComposition', { text: '項目', selectionStart: 2, selectionEnd: 2 })
    await expect(editor).toHaveText('- 項目')
    await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true })
    await expect(editor).toHaveText('- 項目')
    await ime.send('Input.insertText', { text: '項目' })
    await ime.detach()
    await editor.fill('```text\n- literal')
    await editor.press('ControlOrMeta+End')
    await editor.press('Enter')
    await expect.poll(() => editor.locator('.cm-line').allTextContents()).toEqual(['```text', '- literal', ''])
  })
}

test('toolbar insertion preserves the selection, participates in undo, and enforces the length limit', async ({ page }) => {
  await page.goto('/blog/new')
  const editor = page.locator('#post-body')
  await editor.fill('before after')
  await editor.press('Home')
  for (let i = 0; i < 6; i++) await editor.press('Shift+ArrowRight')
  await page.getByRole('button', { name: '太字', exact: true }).click()
  await expect(editor).toHaveText('**強調** after')
  await expect(editor).toBeFocused()
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('before after')
  await editor.fill('a'.repeat(100_000))
  await editor.press('ControlOrMeta+End')
  await editor.press('b')
  await page.getByRole('button', { name: '太字', exact: true }).click()
  await expect(page.locator('.source-pane .pane-heading')).toContainText('100,000 / 100,000')
  await editor.press('Backspace')
  await expect(page.locator('.source-pane .pane-heading')).toContainText('99,999 / 100,000')
})

test('statement and editorial undo histories do not overwrite each other', async ({ page }) => {
  await page.goto('/problems/new')
  const editor = page.locator('#problem-source')
  await editor.fill('- statement')
  await page.getByRole('button', { name: '解説', exact: true }).click()
  await editor.fill('* editorial')
  await page.getByRole('button', { name: '問題文', exact: true }).click()
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('- statement')
  await page.getByRole('button', { name: '解説', exact: true }).click()
  await expect(editor).toHaveText('* editorial')
})
