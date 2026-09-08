import { z } from 'zod'

// Validate the public Go API boundary before rendering upstream content.
export const publicProblemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  statement: z.array(z.string()).min(1),
  constraints: z.array(z.string()),
  inputFormat: z.string(),
  outputFormat: z.string(),
  samples: z.array(z.object({
    input: z.string(),
    output: z.string(),
    explanation: z.string(),
  })),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  isSample: z.boolean(),
})

export type PublicProblem = z.infer<typeof publicProblemSchema>
