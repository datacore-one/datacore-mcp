// src/tools/ingest.ts
import * as fs from 'fs'
import * as path from 'path'

interface IngestArgs {
  content: string
  title?: string
  tags?: string[]
}

interface IngestResult {
  success: boolean
  note_path?: string
  engram_suggestions?: string[]
}

export async function handleIngest(
  args: IngestArgs,
  paths: { knowledgePath: string; engramsPath: string },
): Promise<IngestResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const slug = (args.title ?? 'ingested').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
  const fileName = `${timestamp}-${slug}.md`
  const filePath = path.join(paths.knowledgePath, fileName)

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

function extractEngramSuggestions(content: string): string[] {
  const patterns = [
    /\b(always\s+\w[\w\s]*?)(?:\.|$)/gi,
    /\b(never\s+\w[\w\s]*?)(?:\.|$)/gi,
    /\b(prefer\s+\w[\w\s]*?)(?:\.|$)/gi,
    /\b(avoid\s+\w[\w\s]*?)(?:\.|$)/gi,
    /\b(ensure\s+\w[\w\s]*?)(?:\.|$)/gi,
  ]

  const suggestions: string[] = []
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const suggestion = match[1].trim()
      if (suggestion.length > 10 && suggestion.length < 200) {
        suggestions.push(suggestion)
      }
    }
  }
  return suggestions
}
