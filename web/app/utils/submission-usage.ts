import type { Submission } from '~~/shared/types/submission'

export function executionTime(milliseconds?: number | null) {
  return milliseconds == null ? '—' : `${Math.ceil(milliseconds)} ms`
}

export function memoryUsage(bytes?: number | null) {
  return bytes == null ? '—' : `${(bytes / 1_000_000).toFixed(2)} MB`
}

export function submissionUsage(result: Submission['result']) {
  return `${executionTime(result?.cpuTimeMs)}・ ${memoryUsage(result?.memoryBytes)}`
}
