// src/tools/ingest.ts
import * as path from 'path'
import { validateContent, validateTitle } from '../limits.js'
import { buildHints } from '../hints.js'
import { createNote } from '../durable-files.js'

interface IngestArgs {
  content: string
  title?: string
  tags?: string[]
}

interface IngestResult {
  success: boolean
  note_path?: string
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleIngest(
  args: IngestArgs,
  paths: { knowledgePath: string; basePath?: string },
): Promise<IngestResult> {
  const contentError = validateContent(args.content)
  if (contentError) return { success: false, error: contentError }
  if (args.title) {
    const titleError = validateTitle(args.title)
    if (titleError) return { success: false, error: titleError }
  }

  let filePath: string
  try {
    filePath = createNote(paths.basePath ?? path.dirname(paths.knowledgePath), paths.knowledgePath,
      args.content, args.title ?? 'Ingested Note', args.tags, true)
  } catch {
    return { success: false, error: 'Ingestion could not be durably confirmed. Inspect the destination before retrying.' }
  }

  return {
    success: true,
    note_path: filePath,
    _hints: buildHints({
      next: 'Content saved as knowledge note. Use plur_ingest to also extract engrams from this content.',
      related: ['datacore_search'],
    }),
  }
}
