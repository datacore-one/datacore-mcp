// src/tools/ingest.ts
import * as fs from 'fs'
import * as path from 'path'
import { validateContent, validateTitle } from '../limits.js'

interface IngestArgs {
  content: string
  title?: string
  tags?: string[]
}

interface IngestResult {
  success: boolean
  note_path?: string
  engram_suggestions?: string[]
  error?: string
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

  const suggestions = extractEngramSuggestions(args.content)

  return {
    success: true,
    note_path: filePath,
    engram_suggestions: suggestions.length > 0 ? suggestions : undefined,
  }
}

export function extractEngramSuggestions(content: string): string[] {
  // Require sentence-start context to reduce mid-sentence false positives
  const patterns = [
    /(?:^|[.!?]\s+)(always\s+\w[\w\s]*?)(?:\.|$)/gim,
    /(?:^|[.!?]\s+)(never\s+\w[\w\s]*?)(?:\.|$)/gim,
    /(?:^|[.!?]\s+)(prefer\s+\w[\w\s]*?)(?:\.|$)/gim,
    /(?:^|[.!?]\s+)(avoid\s+\w[\w\s]*?)(?:\.|$)/gim,
    /(?:^|[.!?]\s+)(ensure\s+\w[\w\s]*?)(?:\.|$)/gim,
  ]

  const suggestions: string[] = []
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const suggestion = match[1].trim()
      if (suggestion.length >= 8 && suggestion.length <= 180) {
        suggestions.push(suggestion)
      }
    }
  }
  return suggestions
}
