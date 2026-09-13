import { z } from 'zod'
export const difficultySchema = z.number().int().min(1).max(10).nullable().default(null)
