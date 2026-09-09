import { z } from 'zod'
export const postSummarySchema = z.object({ id: z.string().uuid(), title: z.string(), publishedVersion: z.number().int().nonnegative(), publishedAt: z.string().datetime({ offset: true }).nullable(), updatedAt: z.string(), author: z.string().optional(), isOperator: z.boolean() })
export const postSchema = postSummarySchema.extend({ markdown: z.string().default(''), version: z.number().int().positive() })
export const publicPostSchema = postSummarySchema.extend({ markdown: z.string().min(1), author: z.string(), publishedAt: z.string().datetime({ offset: true }) })
export const postListSchema = z.object({ items: z.array(postSummarySchema), nextCursor: z.string() })
