import { z } from 'zod'
export const profileSchema = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_]{2,19}$/),
  avatar: z.string().max(180000).refine(v => v === '' || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)),
  version: z.number().int().positive(), createdAt: z.string().datetime({ offset: true }),
})
export const profileResultSchema = z.object({ profile: profileSchema.nullable() })
export type Profile = z.infer<typeof profileSchema>
