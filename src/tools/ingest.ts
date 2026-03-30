// src/tools/ingest.ts
import * as fs from 'fs'
import * as path from 'path'
import { getPlur } from '../plur-bridge.js'
import { validateContent, validateTitle } from '../limits.js'
import { buildHints } from '../hints.js'

interface IngestArgs {
  content: string
  title?: string
  tags?: string[]
}

interface IngestResult {
  success: boolean
  note_path?: string
  engram_candidates?: { statement: string; type: string }[]
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleIngest(
  args: IngestArgs,
  paths: { knowledgePath: string; engramsPath: string },
): Promise<IngestResult> {
  const contentError = validateContent(args.content)
  if (contentError) return { success: false, error: contentError }
  if (args.title) {
    const titleError = validateTitle(args.title)
    if (titleError) return { success: false, error: titleError }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const slug = (args.title ?? 'ingested').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
  const fileName = `${timestamp}-${slug}.md`
  const filePath = path.join(paths.knowledgePath, fileName)

  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  const frontmatter = `---\ntitle: "${args.title ?? 'Ingested Note'}"\ncreated: "${new Date().toISOString()}"\ntype: ingested\n---\n\n`
  const tagLine = args.tags?.length ? `\n${args.tags.map(t => `#${t}`).join(' ')}\n` : ''
  fs.writeFileSync(filePath, `${frontmatter}${args.content}\n${tagLine}`)

  // Use PLUR for engram extraction (extract_only: true to not auto-save)
  const plur = getPlur()
  const candidates = plur.ingest(args.content, { extract_only: true, source: filePath })

  return {
    success: true,
    note_path: filePath,
    engram_candidates: candidates.length > 0 ? candidates.map(c => ({ statement: c.statement, type: c.type })) : undefined,
    _hints: candidates.length > 0
      ? buildHints({
          next: `Call datacore.learn for each suggestion to create engrams. Example: datacore.learn({statement: '${candidates[0].statement}', type: '${candidates[0].type}'})`,
          related: ['datacore.learn'],
        })
      : undefined,
  }
}
