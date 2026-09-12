import type { TestFile } from '../../app/utils/problem-draft'

export type Submission = {
  id: string
  problemId: string
  problemVersion: number
  problemTitle: string
  runtime: string
  source?: string
  status: 'QUEUED' | 'RUNNING' | 'DONE'
  progress?: { phase: 'PREPARING' | 'JUDGING', completed: number, total: number } | null
  result: { verdict: string, passed: number, total: number, compileLog?: string, checkerLog?: string, cases?: { name: string, verdict: string, output?: string, outputFile?: TestFile, cpuTimeMs?: number, wallTimeMs?: number, memoryBytes?: number }[] } | null
  createdAt: string
}
