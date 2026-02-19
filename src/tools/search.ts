// src/tools/search.ts
import * as fs from 'fs'
import * as path from 'path'

interface SearchArgs {
  query: string
  scope?: 'journal' | 'knowledge' | 'all'
  limit?: number
}

interface SearchResultItem {
  path: string
  snippet: string
  score: number
}

interface SearchResponse {
  results: SearchResultItem[]
}

export async function handleSearch(
  args: SearchArgs,
  paths: { journalPath: string; knowledgePath: string },
): Promise<SearchResponse> {
  const scope = args.scope ?? 'all'
  const limit = args.limit ?? 20
  const results: SearchResultItem[] = []

  if (scope === 'journal' || scope === 'all') {
    results.push(...searchDir(paths.journalPath, args.query))
  }
  if (scope === 'knowledge' || scope === 'all') {
    results.push(...searchDir(paths.knowledgePath, args.query))
  }

  results.sort((a, b) => b.score - a.score)
  return { results: results.slice(0, limit) }
}

function searchDir(dirPath: string, query: string): SearchResultItem[] {
  if (!fs.existsSync(dirPath)) return []
  const results: SearchResultItem[] = []
  const queryLower = query.toLowerCase()

  for (const file of walkDir(dirPath)) {
    if (!file.endsWith('.md')) continue
    const content = fs.readFileSync(file, 'utf8')
    const contentLower = content.toLowerCase()
    const occurrences = countOccurrences(contentLower, queryLower)
    if (occurrences === 0) continue

    const snippet = extractSnippet(content, query)
    results.push({ path: file, snippet, score: occurrences })
  }
  return results
}

function walkDir(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkDir(fullPath))
    else files.push(fullPath)
  }
  return files
}

function countOccurrences(text: string, query: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(query, pos)) !== -1) {
    count++
    pos += query.length
  }
  return count
}

function extractSnippet(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 100)
  const start = Math.max(0, idx - 50)
  const end = Math.min(content.length, idx + query.length + 50)
  return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
}
