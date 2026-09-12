import { z } from 'zod'
export const publicProblemSummarySchema = z.object({ id: z.string().uuid(), title: z.string().min(1), author: z.string(), publishedAt: z.string().datetime({ offset: true }) })
export const publicProblemSchema = publicProblemSummarySchema.extend({ specialJudge: z.boolean().default(false), markdown: z.string().min(1), editorial: z.string().default(''), timeLimitMs: z.coerce.number().int().positive(), memoryLimitMb: z.coerce.number().int().positive() })
export const publicProblemListSchema = z.object({ items: z.array(publicProblemSummarySchema), nextCursor: z.string() })
export type PublicProblem = z.infer<typeof publicProblemSchema>
