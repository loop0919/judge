import { z } from 'zod'

export const testFileLimit = 16 << 20
export const inlineTestDataLimit = 64 << 10
export const inlineTestSetLimit = 256 << 10
export const testSetLimit = 512 << 20
export const testFileSchema = z.object({ id: z.string().uuid(), size: z.number().int().positive().max(testFileLimit), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
export type TestFile = z.infer<typeof testFileSchema>
export type TestCase = {
  name?: string
  input: string
  output: string
  inputFile?: TestFile
  outputFile?: TestFile
  _inputDirty?: boolean
  _outputDirty?: boolean
}
export function testCaseError(cases: TestCase[]) {
  if (cases.length > 100) return 'テストケースは100件まで登録できます。'
  const encoder = new TextEncoder()
  let total = 0
  const names = new Set<string>()
  for (const [index, item] of cases.entries()) {
    const name = (item.name ?? '').trim()
    if ([...(item.name ?? '')].length > 64 || /[\u0000-\u001f\u007f-\u009f]/.test(item.name ?? '') || (item.name && !name)) return `ケース${index + 1}の名前は64文字以内で、改行や制御文字を含めずに入力してください。`
    if (name && names.has(name)) return `テストケース名「${name}」が重複しています。`
    if (name) names.add(name)
    for (const key of ['input', 'output'] as const) {
      const file = item[`${key}File`]
      const dirty = item[`_${key}Dirty`]
      const value = item[key]
      const size = file && !dirty ? file.size : encoder.encode(value).length
      if (value.includes('\0')) return `ケース${index + 1}に使用できない文字が含まれています。`
      if (size > testFileLimit) return `ケース${index + 1}の入力と期待出力は、それぞれ16 MiB以内にしてください。`
      total += size
    }
  }
  return total > testSetLimit ? 'テストケース全体を512 MiB以内にしてください。' : ''
}

export function persistedDraft<T extends { testCases: TestCase[] }>(draft: T) {
  return {
    ...draft,
    testCases: draft.testCases.map((item) => {
      const result: Record<string, unknown> = { name: item.name }
      for (const key of ['input', 'output'] as const) {
        const file = item[`${key}File`]
        if (file && !item[`_${key}Dirty`]) {
          result[key] = ''
          result[`${key}File`] = file
        } else {
          result[key] = item[key]
        }
      }
      return result
    }),
  }
}

export const generatorSchema = z.object({ runtime: z.string().max(64).default('cpp17'), source: z.string().default('') })
export const generatorsSchema = z.object({ input: generatorSchema, output: generatorSchema, validation: generatorSchema.default({ runtime: 'cpp17', source: '' }) })
export type Generators = z.infer<typeof generatorsSchema>
export const emptyGenerators = (): Generators => ({ input: { runtime: 'cpp17', source: '' }, output: { runtime: 'cpp17', source: '' }, validation: { runtime: 'cpp17', source: '' } })

export const problemDraftSchema = z.object({
  checker: generatorSchema.nullable().default(null),
  generators: generatorsSchema.default(emptyGenerators),
  title: z.string().max(120),
  markdown: z.string().max(100_000),
  editorial: z.string().max(100_000).default(''),
  timeLimitMs: z.string().max(10),
  memoryLimitMb: z.string().max(10),
  testCases: z.array(z.object({
    name: z.string().optional(), input: z.string().default(''), output: z.string().default(''),
    inputFile: testFileSchema.optional(), outputFile: testFileSchema.optional(),
  })).default([]),
})
export type ProblemDraft = z.infer<typeof problemDraftSchema>

export function draftErrors(draft: ProblemDraft) {
  const time = Number(draft.timeLimitMs)
  const memory = Number(draft.memoryLimitMb)
  return {
    checker: draft.checker && (!draft.checker.source.trim() || new TextEncoder().encode(draft.checker.source).length > 65536 || draft.checker.source.includes('\0')) ? '検証コードを1〜65,536バイトで入力してください。' : '',
    title: draft.title.trim() ? '' : '問題のタイトルを入力してください。',
    markdown: draft.markdown.trim() ? '' : '問題の本文を入力してください。',
    timeLimitMs: Number.isInteger(time) && time >= 100 && time <= 5000 && time % 100 === 0 ? '' : '100〜5,000 ms の範囲で100 ms刻みの値を選んでください。',
    memoryLimitMb: Number.isInteger(memory) && memory >= 64 && memory <= 512 ? '' : '64〜512 MiB の整数を選んでください。',
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
