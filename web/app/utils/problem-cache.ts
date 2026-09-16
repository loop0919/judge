import { accountProblemSchema } from '~~/shared/types/account-problems'
import type { z } from 'zod'

// Cache only server-confirmed snapshots, scoped to the signed-in owner.
// A cached snapshot never authorizes editing or replaces a successful server read.
const key = (owner: string, id: string) => `openoj.problem-cache.v1.${encodeURIComponent(owner)}.${id}`
export function readProblemCache(owner: string, id: string) {
  try {
    const value = accountProblemSchema.parse(JSON.parse(sessionStorage.getItem(key(owner, id)) ?? 'null'))
    return value.id === id ? value : null
  } catch { return null }
}
export function writeProblemCache(owner: string, problem: z.infer<typeof accountProblemSchema>) {
  try { sessionStorage.setItem(key(owner, problem.id), JSON.stringify(problem)) } catch { /* Cache is optional. */ }
}
export function removeProblemCache(owner: string, id: string) {
  try { sessionStorage.removeItem(key(owner, id)) } catch { /* Cache is optional. */ }
}
