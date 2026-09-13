import { testCaseError, testFileLimit, testSetLimit, type TestCase } from './problem-draft'

export async function importTestCases(inputs: File[], outputs: File[], existing: TestCase[]): Promise<TestCase[]> {
  const pairs = new Map<string, { input?: File, output?: File }>()
  const encoder = new TextEncoder()
  let total = existing.reduce((sum, item) => sum + (['input', 'output'] as const).reduce((size, key) => size + (item[`${key}File`] && !item[`_${key}Dirty`] ? item[`${key}File`]!.size : encoder.encode(item[key]).length), 0), 0)
  for (const { file, key } of [...inputs.map(file => ({ file, key: 'input' as const })), ...outputs.map(file => ({ file, key: 'output' as const }))]) {
    if (!/^.+\.txt$/.test(file.name)) throw new Error('フォルダには .txt ファイルだけを入れてください。')
    const name = file.name
    const pair = pairs.get(name) ?? {}
    if (pair[key]) throw new Error(`「${file.name}」が重複しています。`)
    if (file.size > testFileLimit) throw new Error(`「${file.name}」は16 MiB以内にしてください。`)
    total += file.size
    if (total > testSetLimit) throw new Error('テストケース全体を512 MiB以内にしてください。')
    pair[key] = file
    pairs.set(name, pair)
  }
  const imported = [...pairs.keys()].map(name => ({ name, input: '', output: '' }))
  const error = testCaseError([...existing, ...imported])
  if (error) throw new Error(error)
  for (const [name, pair] of pairs) {
    if (!pair.input || !pair.output) throw new Error(`「${name}」の入力と期待出力を両方のフォルダに用意してください。空データの場合も空のファイルが必要です。`)
  }
  for (const item of imported) {
    const pair = pairs.get(item.name)!
    for (const key of ['input', 'output'] as const) {
      const file = pair[key]!
      const bytes = await file.arrayBuffer()
      try {
        item[key] = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        throw new Error(`「${file.name}」はUTF-8のテキストファイルにしてください。`)
      }
    }
  }
  const contentError = testCaseError([...existing, ...imported])
  if (contentError) throw new Error(contentError)
  return imported
}
