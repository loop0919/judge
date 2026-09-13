import { z } from 'zod'
import { problemDraftSchema } from './problem-draft'

export const accountProblemSchema = z.object({ id: z.string().uuid(), publishedVersion: z.number().int().nonnegative().default(0), version: z.number().int().positive(), updatedAt: z.string().datetime({ offset: true }), draft: problemDraftSchema })
export const accountListSchema = z.object({
  items: z.array(z.object({ contestId: z.string().default(''), id: z.string().uuid(), title: z.string(), publishedVersion: z.number().int().nonnegative().default(0), updatedAt: z.string().datetime({ offset: true }) })),
  nextCursor: z.string(),
})
export type AccountSummary = z.infer<typeof accountListSchema>['items'][number]

export function accountError(error: unknown) {
  const status = (error as { statusCode?: number, response?: { status?: number } }).statusCode ?? (error as { response?: { status?: number } }).response?.status
  const code = (error as { data?: { data?: { code?: string } } }).data?.data?.code
  if (code === 'contest_problem_locked') return 'コンテストに登録された問題は公開・削除できません。公開はコンテスト終了後に自動で行われます。'
  if (status === 401) return 'ログインの有効期限が切れました。別のタブでログインし直してから、もう一度保存してください。'
  if (status === 409) return '別の画面で更新されています。入力内容をコピーしてからページを再読み込みし、変更を確認してください。'
  if (status === 404) return '問題が見つからないか、アクセスできません。'
  return 'サーバーに接続できないか、処理に失敗しました。入力内容を保持したまま、もう一度お試しください。'
}
