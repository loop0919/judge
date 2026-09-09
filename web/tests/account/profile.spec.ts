import { expect, test } from '@playwright/test'

test('new users must choose an ID, upload an icon, and can edit their persisted profile', async ({ page }, testInfo) => {
  const email = `profile-${Date.now()}@example.test`
  const origin = 'http://127.0.0.1:13002'
  for (const [action, data] of [
    ['signup', { email, password: 'ValidPassword123!' }],
    ['confirm-signup', { email, code: '123456' }],
  ] as const) {
    expect((await page.request.post(`/api/auth/${action}`, { headers: { origin }, data })).ok()).toBe(true)
  }
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill('ValidPassword123!')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page).toHaveURL('/onboarding')
  expect((await page.request.get('/api/my/problems')).status()).toBe(403)
  await page.goto('/problems/new')
  await expect(page).toHaveURL('/onboarding')
  await page.getByLabel('ユーザーID', { exact: true }).fill('ALICE')
  await page.getByRole('button', { name: '登録してはじめる' }).click()
  await expect(page.getByRole('alert')).toContainText('使われています')
  const handle = `coder_${Date.now()}`
  await page.getByLabel('ユーザーID', { exact: true }).fill(handle)
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#18794e'; ctx.fillRect(0, 0, 256, 128)
    return c.toDataURL('image/png').split(',')[1]!
  })
  await page.getByLabel('アイコン（任意）').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.locator('.avatar-field img')).toBeVisible()
  await page.getByRole('button', { name: '登録してはじめる' }).click()
  await expect(page).toHaveURL('/my')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(handle)
  await expect(page.locator('.profile-header img')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(handle)
  await page.screenshot({ path: testInfo.outputPath('my-page-desktop.png'), fullPage: true })
  const stored = await (await page.request.get('/api/my/profile')).json()
  expect(stored.profile.avatar).toMatch(/^data:image\/png;base64,/)
  expect((await page.request.put('/api/my/profile', { headers: { origin: 'https://attacker.example' }, data: { handle: 'attacker', version: 1, avatar: '' } })).status()).toBe(403)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('link', { name: 'プロフィールを編集' }).click()
  await page.screenshot({ path: testInfo.outputPath('profile-settings-mobile.png'), fullPage: true })
  await page.getByLabel('ユーザーID', { exact: true }).fill(`new_${Date.now()}`)
  await page.getByRole('button', { name: 'アイコンを削除' }).click()
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page).toHaveURL('/my')
  await expect(page.locator('.profile-header img')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.goto('/onboarding')
  await expect(page).toHaveURL('/my')
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await page.goto('/my')
  await expect(page).toHaveURL(/\/login/)
})
