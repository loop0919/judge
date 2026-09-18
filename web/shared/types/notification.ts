import { z } from 'zod'
export const notificationsSchema = z.object({ notifications: z.array(z.object({
  id: z.string().uuid(), problemId: z.string().uuid(), title: z.string(), actor: z.string(),
  kind: z.enum(['favorite', 'first_accept', 'tester']), createdAt: z.string(),
})) })
export type Notification = z.infer<typeof notificationsSchema>['notifications'][number]

export const notificationMessages = { favorite: 'がお気に入りに追加しました', first_accept: 'が初めて正解しました', tester: 'がテスターに参加しました' }
