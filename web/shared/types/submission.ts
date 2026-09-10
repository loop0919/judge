export type Submission = {
  id: string
  problemId: string
  problemVersion: number
  problemTitle: string
  runtime: string
  source?: string
  status: 'QUEUED' | 'RUNNING' | 'DONE'
  result: { verdict: string, passed: number, total: number, compileLog?: string } | null
  createdAt: string
}
