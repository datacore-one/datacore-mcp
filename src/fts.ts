// src/fts.ts
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

export interface FtsResult {
  path: string
  snippet: string
  score: number
  title: string
  type: string
}

export interface FtsOptions {
  includeStubs?: boolean
  limit?: number
  scope?: 'journal' | 'knowledge' | 'all'
}

/**
 * Resolve the knowledge.db path for a given space root directory.
 */
export function resolveSpaceDbPath(spacePath: string): string {
  return path.join(spacePath, '.datacore', 'knowledge.db')
}

/**
 * Tokenize a natural language query into FTS5 MATCH syntax.
 * "SOL trading framework" → "SOL AND trading AND framework"
 * Quoted phrases pass through: '"exact phrase"' → '"exact phrase"'
 */
export function tokenizeQuery(query: string): string {
  // Preserve quoted phrases
  const quoted: string[] = []
  const stripped = query.replace(/"([^"]+)"/g, (_, phrase) => {
    quoted.push(`"${phrase}"`)
    return `__QUOTED_${quoted.length - 1}__`
  })

  // Split remaining words, filter very short ones (keep 2+ chars for AI, ML etc)
  const words = stripped
    .split(/\s+/)
    .filter(w => w.length > 1 || w.startsWith('__QUOTED'))
    .map(w => {
      const match = w.match(/^__QUOTED_(\d+)__$/)
      if (match) return quoted[parseInt(match[1])]
      // Strip non-alphanumeric for FTS safety
      return w.replace(/[^\w-]/g, '')
    })
    .filter(Boolean)

  if (words.length === 0) return query
  return words.join(' AND ')
}

/**
 * Search the FTS5 index in a knowledge.db file.
 */
export function searchFts(dbPath: string, query: string, options: FtsOptions = {}): FtsResult[] {
  if (!fs.existsSync(dbPath)) return []

  const limit = options.limit ?? 20
  const ftsQuery = tokenizeQuery(query)

  let db: InstanceType<typeof Database>
  try {
    db = new Database(dbPath, { readonly: true })
  } catch {
    return []
  }

  try {
    const stubFilter = options.includeStubs ? '' : 'AND f.is_stub = 0'

    // Scope filter: journal type for journal scope, non-journal for knowledge scope
    let scopeFilter = ''
    if (options.scope === 'journal') {
      scopeFilter = "AND f.type = 'journal'"
    } else if (options.scope === 'knowledge') {
      scopeFilter = "AND f.type != 'journal'"
    }

    const stmt = db.prepare(`
      SELECT f.path,
             snippet(files_fts, 1, '', '', '...', 32) as snippet,
             rank * -1 as score,
             f.title,
             f.type
      FROM files_fts
      JOIN files f ON f.rowid = files_fts.rowid
      WHERE files_fts MATCH ?
      ${stubFilter}
      ${scopeFilter}
      ORDER BY rank
      LIMIT ?
    `)

    const rows = stmt.all(ftsQuery, limit) as Array<{
      path: string
      snippet: string
      score: number
      title: string
      type: string
    }>

    return rows.map(r => ({
      path: r.path,
      snippet: r.snippet,
      score: r.score,
      title: r.title,
      type: r.type,
    }))
  } catch (e) {
    // Log FTS errors for debugging — silent failures make FTS-to-fallback invisible
    if (process.env.DEBUG) console.error(`FTS query error for "${query}":`, e)
    return []
  } finally {
    db.close()
  }
}
