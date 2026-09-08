import { z } from 'zod'
import { draftStorageKey, problemDraftSchema, type ProblemDraft } from './problem-draft'

export const draftPrefix = 'openoj.problem-drafts.v2.'
export const activeDraftKey = 'openoj.active-draft.v2'
const entrySchema = z.object({ version: z.literal(2), id: z.string(), updatedAt: z.string().datetime(), draft: problemDraftSchema })
export type DraftEntry = z.infer<typeof entrySchema>
export const validDraftId = (id: string) => /^(legacy|[a-f0-9-]{36})$/.test(id)

export function readDraft(storage: Storage, id: string): DraftEntry | null {
  if (!validDraftId(id)) throw new Error('Invalid draft ID')
  const raw = storage.getItem(draftPrefix + id)
  if (!raw) return null
  const entry = entrySchema.parse(JSON.parse(raw))
  if (entry.id !== id) throw new Error('Mismatched draft ID')
  return entry
}

export function migrateLegacyDraft(storage: Storage) {
  if (storage.getItem(draftPrefix + 'legacy')) return
  const raw = storage.getItem(draftStorageKey)
  if (!raw) return
  const old = z.object({ version: z.literal(1), draft: problemDraftSchema }).parse(JSON.parse(raw))
  writeDraft(storage, 'legacy', old.draft)
  // Keep the original as a recovery copy.
}

export function writeDraft(storage: Storage, id: string, draft: ProblemDraft) {
  if (!validDraftId(id)) throw new Error('Invalid draft ID')
  const entry = entrySchema.parse({ version: 2, id, updatedAt: new Date().toISOString(), draft })
  storage.setItem(draftPrefix + id, JSON.stringify(entry))
  return entry
}

export function listDrafts(storage: Storage) {
  const entries: DraftEntry[] = []
  let unreadable = 0
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(draftPrefix)) continue
    try {
      const entry = readDraft(storage, key.slice(draftPrefix.length))
      if (entry) entries.push(entry)
    } catch { unreadable++ }
  }
  return { entries: entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), unreadable }
}

export function deleteDraft(storage: Storage, id: string) {
  if (!validDraftId(id)) throw new Error('Invalid draft ID')
  if (storage.getItem(activeDraftKey) === id) storage.removeItem(activeDraftKey)
  // Remove the recovery copy first so a deleted legacy draft cannot be migrated again.
  if (id === 'legacy') storage.removeItem(draftStorageKey)
  storage.removeItem(draftPrefix + id)
}
