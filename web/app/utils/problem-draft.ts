import { z } from 'zod'

export const draftStorageKey = 'openoj.problem-draft.v1'
export const problemDraftSchema = z.object({
  title: z.string().max(120),
  markdown: z.string().max(100_000),
  timeLimitMs: z.string().max(10),
  memoryLimitMb: z.string().max(10),
})
export type ProblemDraft = z.infer<typeof problemDraftSchema>

export function draftErrors(draft: ProblemDraft) {
  const time = Number(draft.timeLimitMs)
  const memory = Number(draft.memoryLimitMb)
  return {
    title: draft.title.trim() ? '' : '問題のタイトルを入力してください。',
    markdown: draft.markdown.trim() ? '' : '問題の本文を入力してください。',
    timeLimitMs: Number.isInteger(time) && time >= 100 && time <= 5000 && time % 100 === 0 ? '' : '100〜5,000 ms の範囲で100 ms刻みの値を選んでください。',
    memoryLimitMb: Number.isInteger(memory) && memory >= 64 && memory <= 1024 ? '' : '64〜1,024 MiB の整数を選んでください。',
  }
}

export function exportProblemMarkdown(draft: ProblemDraft): string {
  if (Object.values(draftErrors(draft)).some(Boolean)) throw new Error('Invalid problem draft')
  return [
    '---',
    `title: ${JSON.stringify(draft.title.trim())}`,
    `time_limit_ms: ${Number(draft.timeLimitMs)}`,
    `memory_limit_mb: ${Number(draft.memoryLimitMb)}`,
    '---', '', draft.markdown, '',
  ].join('\n')
}

export const initialProblemMarkdown = [
  '## 問題文', '',
  '2 つの整数 $A$ と $B$ が与えられます。$A + B$ を求めてください。', '',
  '## 制約', '', '- $0 \\le A, B \\le 10^9$', '- 入力はすべて整数です。', '',
  '## 入力', '', '入力は以下の形式で標準入力から与えられます。', '',
  '```input', '$A \\quad B$', '```', '',
  '## 出力', '', '$A + B$ を 1 行に出力してください。', '',
  '## 入出力例', '', '### 入力例 1', '', '```text', '3 5', '```', '',
  '### 出力例 1', '', '```text', '8', '```', '',
  '$3 + 5 = 8$ なので、$8$ を出力します。', '',
].join('\n')
