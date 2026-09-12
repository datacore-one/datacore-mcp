// src/tools/capture.ts
import * as path from 'path'
import type { StorageConfig } from '../storage.js'
import { validateContent, validateTitle } from '../limits.js'
import { appendJournal, createNote } from '../durable-files.js'

interface CaptureArgs {
  type: 'journal' | 'knowledge'
  content: string
  title?: string
  tags?: string[]
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
  try {
    if (args.type === 'journal') {
      const { date, time } = localDate()
      const filename = path.join(storage.journalPath, `${date}.md`)
      appendJournal(storage.basePath, storage.statePath ?? path.join(storage.basePath, '.datacore/state'),
        filename, `# ${date}\n`, `\n## ${time}\n\n${args.content}\n`)
      return { success: true, path: filename }
    }
    return { success: true, path: createNote(storage.basePath, storage.knowledgePath,
      args.content, args.title ?? 'Untitled', args.tags) }
  } catch {
    return { success: false, error: 'Capture could not be durably confirmed. Inspect the destination before retrying.' }
  }
}

export function localDate(tz?: string): { date: string; time: string } {
  const timezone = tz || process.env.DATACORE_TIMEZONE || undefined
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }) // en-CA gives YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone })
  return { date: dateStr, time: timeStr }
}
