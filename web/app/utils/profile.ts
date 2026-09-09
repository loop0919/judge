import { z } from 'zod'
export const profileSchema = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_]{2,19}$/),
  avatar: z.string().max(180000).refine(v => v === '' || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)),
  version: z.number().int().positive(), createdAt: z.string().datetime({ offset: true }),
})
export const profileResultSchema = z.object({ profile: profileSchema.nullable() })
export type Profile = z.infer<typeof profileSchema>
export function profileError(error: unknown) {
  const e = error as { data?: { data?: { code?: string } }, statusCode?: number }
  const code = e.data?.data?.code
  if (code === 'handle_taken') return 'このユーザーIDは使われています。別のIDを入力してください。'
  if (code === 'profile_conflict') return '別の画面でプロフィールが更新されています。再読み込みしてから変更してください。'
  if (e.statusCode === 401) return 'ログインの有効期限が切れました。ログインし直してください。'
  return '保存できませんでした。入力内容を確認し、もう一度お試しください。'
}
