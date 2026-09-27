// src/tools/capture.ts
import * as path from 'path'
import { assertStorageCurrent, type StorageConfig, type SpacePaths } from '../storage.js'
import { validateContent, validateTitle } from '../limits.js'
import { appendJournal, createNote } from '../durable-files.js'

export const NOTE_KINDS = ['zettel', 'literature', 'reference', 'pages'] as const
export type NoteKind = typeof NOTE_KINDS[number]

interface CaptureArgs {
  type: 'journal' | 'knowledge'
  content: string
  title?: string
  tags?: string[]
  space?: string
  kind?: NoteKind
}

interface CaptureResult {
  success: boolean
  path?: string
  error?: string
}

export async function handleCapture(args: CaptureArgs, storage: StorageConfig): Promise<CaptureResult> {
  const contentError = validateContent(args.content)
  if (contentError) return { success: false, error: contentError }
  if (args.title) {
    const titleError = validateTitle(args.title)
    if (titleError) return { success: false, error: titleError }
  }
  if (args.kind !== undefined && !(NOTE_KINDS as readonly string[]).includes(args.kind)) {
    return { success: false, error: `Unknown note kind '${args.kind}'. Use one of: ${NOTE_KINDS.join(', ')}.` }
  }
  try {
    assertStorageCurrent(storage)
    let journalPath = storage.journalPath
    let knowledgePath = storage.knowledgePath
    if (args.space !== undefined) {
      const space = findSpace(storage.spaces, args.space)
      if (!space) {
        return { success: false, error: `No space '${args.space}'. Spaces: ${storage.spaces.map(s => s.name).join(', ')}.` }
      }
      journalPath = space.journalPath
      knowledgePath = space.knowledgePath
    }
    if (!journalPath || !knowledgePath) {
      return { success: false, error: 'Capture requires one unambiguous personal space, or name the space.' }
    }
    if (args.type === 'journal') {
      const { date, time } = localDate()
      const filename = path.join(journalPath, `${date}.md`)
      appendJournal(storage.basePath, storage.statePath ?? path.join(storage.basePath, '.datacore/state'),
        filename, `# ${date}\n`, `\n## ${time}\n\n${args.content}\n`)
      return { success: true, path: filename }
    }
    // KNW-1: a knowledge note lands in its kind's folder (3-knowledge/zettel, ...).
    const directory = args.kind ? path.join(knowledgePath, args.kind) : knowledgePath
    return { success: true, path: createNote(storage.basePath, directory,
      args.content, args.title ?? 'Untitled', args.tags) }
  } catch {
    return { success: false, error: 'Capture could not be durably confirmed. Inspect the destination before retrying.' }
  }
}

/** A space by its name (`team`) or its folder (`1-team`). */
export function findSpace(spaces: SpacePaths[], wanted: string): SpacePaths | undefined {
  return spaces.find(s => s.name === wanted)
    ?? spaces.find(s => s.rootPath !== undefined && path.basename(s.rootPath) === wanted)
}

export function localDate(tz?: string): { date: string; time: string } {
  const timezone = tz || process.env.DATACORE_TIMEZONE || undefined
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }) // en-CA gives YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone })
  return { date: dateStr, time: timeStr }
}
