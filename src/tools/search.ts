// src/tools/search.ts
import * as fs from 'fs'
import * as path from 'path'
import type { DatacortexBridge } from '../datacortex.js'
import { getConfig } from '../config.js'

const CONTENT_CACHE_MAX = 500
const contentCache = new Map<string, { mtime: number; content: string }>()

function getCachedContent(filePath: string): string | null {
  const entry = contentCache.get(filePath)
  if (!entry) return null
  try {
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs === entry.mtime) return entry.content
  } catch { /* file gone */ }
  contentCache.delete(filePath)
  return null
}

function setCachedContent(filePath: string, content: string): void {
  try {
    const mtime = fs.statSync(filePath).mtimeMs
    if (contentCache.size >= CONTENT_CACHE_MAX) {
      const firstKey = contentCache.keys().next().value
      if (firstKey) contentCache.delete(firstKey)
    }
    contentCache.set(filePath, { mtime, content })
  } catch { /* ignore */ }
}

interface SearchArgs {
  query: string
  scope?: 'journal' | 'knowledge' | 'all'
  method?: 'keyword' | 'semantic'
  limit?: number
}

interface SearchResultItem {
  path: string
  snippet: string
  score: number
  title?: string
  date?: string
}

interface SearchResponse {
  results: SearchResultItem[]
  method?: string
  fallback_warning?: string
}

export async function handleSearch(
  args: SearchArgs,
  paths: { journalPath: string; knowledgePath: string },
  bridge?: DatacortexBridge | null,
): Promise<SearchResponse> {
  // Semantic search via Datacortex bridge
  if (args.method === 'semantic' && bridge) {
    const availability = bridge.isAvailable()
    if (availability.available) {
      const result = await bridge.search(args.query, args.limit ?? 20)
      if (!result.fallback) {
        return { results: result.results, method: 'semantic' }
      }
    }
    const keywordResults = await keywordSearch(args, paths)
    return { ...keywordResults, method: 'keyword', fallback_warning: 'Semantic search unavailable, using keyword fallback' }
  }

  return keywordSearch(args, paths)
}

async function keywordSearch(
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
  return { results: results.slice(0, limit), method: 'keyword' }
}

function searchDir(dirPath: string, query: string): SearchResultItem[] {
  if (!fs.existsSync(dirPath)) return []
  const results: SearchResultItem[] = []
  const queryLower = query.toLowerCase()

  for (const file of walkDir(dirPath)) {
    if (!file.endsWith('.md')) continue
    const content = getCachedContent(file) ?? (() => {
      const c = fs.readFileSync(file, 'utf8')
      setCachedContent(file, c)
      return c
    })()
    const contentLower = content.toLowerCase()
    const occurrences = countOccurrences(contentLower, queryLower)
    if (occurrences === 0) continue

    const snippet = extractSnippet(content, query)
    const title = extractTitle(content, file)
    const date = extractDate(file)
    results.push({ path: file, snippet, score: occurrences, title, date })
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
  const snippetLength = getConfig().search.snippet_length

  // Small files: return full content
  if (content.length < 2000) return content

  const idx = content.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, snippetLength)
  const half = Math.floor(snippetLength / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(content.length, idx + query.length + half)
  return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
}

function extractTitle(content: string, filePath: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  return path.basename(filePath, path.extname(filePath))
}

function extractDate(filePath: string): string | undefined {
  const match = path.basename(filePath).match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  return undefined
}
