// src/tools/search.ts
import * as fs from 'fs'
import * as path from 'path'
import type { DatacortexBridge } from '../datacortex.js'
import { getConfig } from '../config.js'
import { searchFts, resolveSpaceDbPath } from '../fts.js'
import { readTextWithin } from '../safe-read.js'

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

interface SearchPaths {
  journalPath: string | null
  knowledgePath: string | null
  spaces?: Array<{ name: string; rootPath?: string; journalPath: string; knowledgePath: string }>
}

export async function handleSearch(
  args: SearchArgs,
  paths: SearchPaths,
  bridge?: DatacortexBridge | null,
): Promise<SearchResponse> {
  if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 20000
    || (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 1000))) {
    throw new Error('Invalid search query or limit')
  }
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
    return { ...keywordResults, method: 'keyword', fallback_warning:
      ['Semantic search unavailable, using keyword fallback', keywordResults.fallback_warning].filter(Boolean).join('. ') }
  }

  return keywordSearch(args, paths)
}

async function keywordSearch(
  args: SearchArgs,
  paths: SearchPaths,
): Promise<SearchResponse> {
  const scope = args.scope ?? 'all'
  const limit = args.limit ?? 20

  // Try FTS5 first — check space DBs
  const budget = { nodes: 10000, bytes: 32 * 1024 * 1024, incomplete: false }
  const ftsResults: SearchResultItem[] = []
  const spaces = paths.spaces ?? (paths.journalPath && paths.knowledgePath
    ? [{ name: 'default', rootPath: undefined, journalPath: paths.journalPath, knowledgePath: paths.knowledgePath }] : [])

  for (const space of spaces) {
    // Derive space root from knowledgePath (handles both /3-knowledge and /knowledge paths)
    const spaceRoot = space.rootPath ?? space.knowledgePath.replace(/\/(3-)?knowledge$/, '')
    const spaceDbPath = resolveSpaceDbPath(spaceRoot)
    const results = searchFts(spaceDbPath, args.query, {
      rootPath: spaceRoot,
      onUnavailable: () => { budget.incomplete = true },
      scope: scope === 'all' ? undefined : scope,
      limit,
      includeStubs: (args as any).include_stubs,
    })
    for (const r of results) {
      if (typeof r.path !== 'string' || typeof r.snippet !== 'string'
        || typeof r.score !== 'number' || !Number.isFinite(r.score)) continue
      const target = path.resolve(spaceRoot, r.path)
      try {
        const canonicalRoot = fs.realpathSync(spaceRoot)
        const canonicalTarget = path.join(canonicalRoot, path.relative(path.resolve(spaceRoot), target))
        const info = fs.lstatSync(target)
        if (!within(spaceRoot, target) || fs.realpathSync(target) !== canonicalTarget
          || !info.isFile() || info.nlink !== 1) continue
      } catch { continue }
      ftsResults.push({
        path: target,
        snippet: r.snippet,
        score: r.score,
        title: r.title,
      })
    }
  }

  // An index in one space cannot suppress uncached files in another. Always
  // search current journal/knowledge sources; stale indexed copies never win.
  const results: SearchResultItem[] = []
  for (const space of spaces) {
    const root = space.rootPath ?? path.dirname(space.knowledgePath)
    if (scope === 'journal' || scope === 'all') {
      results.push(...searchDir(root, space.journalPath, args.query, budget))
    }
    if (scope === 'knowledge' || scope === 'all') {
      results.push(...searchDir(root, space.knowledgePath, args.query, budget))
    }
  }
  const found = new Map(results.map(r => [r.path, r]))
  for (const r of ftsResults) {
    // Covered source files are represented only by their current disk content.
    if (spaces.some(s => within(s.journalPath, r.path) || within(s.knowledgePath, r.path))) continue
    if (!found.has(r.path)) found.set(r.path, r)
  }
  const combined = [...found.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return { results: combined.slice(0, limit), method: ftsResults.length ? 'fts5+keyword' : 'keyword',
    ...(budget.incomplete ? { fallback_warning: 'Search coverage is incomplete: unreadable, linked, changing or oversized inputs, or the scan limit, prevented full verification.' } : {}) }
}

function within(directory: string, filename: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filename))
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

interface ScanBudget { nodes: number; bytes: number; incomplete: boolean }

function searchDir(root: string, dirPath: string, query: string, budget: ScanBudget): SearchResultItem[] {
  if (!fs.existsSync(dirPath)) return []
  const results: SearchResultItem[] = []
  for (const file of walkDir(root, dirPath, budget)) {
    if (!file.endsWith('.md')) continue
    try {
      if (budget.bytes <= 0) { budget.incomplete = true; break }
      const content = readTextWithin(root, file, Math.min(4 * 1024 * 1024, budget.bytes))
      if (content === null) { budget.incomplete = true; continue }
      budget.bytes -= Buffer.byteLength(content)
      const occurrences = countOccurrences(content.toLowerCase(), query.toLowerCase())
      if (occurrences === 0) continue
      results.push({ path: file, snippet: extractSnippet(content, query), score: occurrences,
        title: extractTitle(content, file), date: extractDate(file) })
    } catch { budget.incomplete = true }
  }
  return results
}

function* walkDir(root: string, dir: string, budget: ScanBudget, depth = 0): Generator<string> {
  let handle: fs.Dir | undefined
  try {
    const canonical = path.join(fs.realpathSync(root), path.relative(path.resolve(root), path.resolve(dir)))
    if (!within(root, dir) || fs.realpathSync(dir) !== canonical || depth > 32) throw new Error()
    handle = fs.opendirSync(dir)
    let entry: fs.Dirent | null
    while ((entry = handle.readSync())) {
      if (--budget.nodes < 0) { budget.incomplete = true; return }
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) yield* walkDir(root, fullPath, budget, depth + 1)
      else if (entry.isFile()) yield fullPath
      else budget.incomplete = true
    }
  } catch { budget.incomplete = true }
  finally { handle?.closeSync() }
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
