// src/tools/ingest.ts
import * as fs from 'fs'
import * as path from 'path'
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
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleIngest(
  args: IngestArgs,
  paths: { knowledgePath: string },
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

  return {
    success: true,
    note_path: filePath,
    _hints: buildHints({
      next: 'Content saved as knowledge note. Use plur_ingest to also extract engrams from this content.',
      related: ['datacore.search'],
    }),
  }
}
