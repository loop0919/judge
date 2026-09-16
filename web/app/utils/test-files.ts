import { z } from 'zod'
import { testFileSchema, testFileLimit, type TestFile } from '~~/shared/types/problem-draft'

const uploadSchema = z.object({ id: z.string().uuid(), url: z.string().url(), headers: z.record(z.string(), z.string()) })
const downloadSchema = z.object({ url: z.string().url(), size: z.number().int().positive().max(testFileLimit), sha256: z.string().regex(/^[a-f0-9]{64}$/) })

async function sha256(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(value => value.toString(16).padStart(2, '0')).join('')
}

export async function uploadTestFile(problemId: string, text: string): Promise<TestFile> {
  const bytes = new TextEncoder().encode(text)
  if (!bytes.length || bytes.length > testFileLimit || text.includes('\0')) throw new Error('Invalid test file')
  const digest = await sha256(bytes)
  const upload = uploadSchema.parse(await $fetch(`/api/my/problems/${problemId}/test-files`, { method: 'POST', body: { size: bytes.length, sha256: digest } }))
  const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes })
  if (!response.ok) throw new Error('Test file upload failed')
  return testFileSchema.parse(await $fetch(`/api/my/problems/${problemId}/test-files/${upload.id}/complete`, { method: 'POST' }))
}

export async function downloadTestFile(problemId: string, file: TestFile): Promise<string> {
  const download = downloadSchema.parse(await $fetch(`/api/my/problems/${problemId}/test-files/${file.id}`))
  if (download.size !== file.size || download.sha256 !== file.sha256) throw new Error('Mismatched test file')
  const response = await fetch(download.url)
  if (!response.ok) throw new Error('Test file download failed')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length !== file.size || await sha256(bytes) !== file.sha256) throw new Error('Test file integrity check failed')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (text.includes('\0')) throw new Error('Invalid test file')
  return text
}
