/** The installed Python library owns discovery; Node never infers space identity. */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { findPython } from './runtime-python.js'

export interface CatalogSpace {
  name: string
  type: string
  marked: boolean
  rootPath: string
  journalPath: string
  knowledgePath: string
}

export function readSpaceCatalog(basePath: string): CatalogSpace[] {
  try {
    const root = fs.realpathSync(basePath)
    const library = process.env.DATACORE_LIB ?? path.join(root, '.datacore/lib')
    const python = findPython()
    if (!python || !library || !path.isAbsolute(library)) throw new Error()
    const raw = execFileSync(python, ['-I', path.join(library, 'space_catalog.py'), '--root', root], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const catalog = JSON.parse(raw)
    if (catalog.version !== 1 || catalog.error || !Array.isArray(catalog.spaces)) throw new Error()
    const names = new Set<string>(), paths = new Set<string>()
    return catalog.spaces.map((s: Record<string, unknown>) => {
      if (!s || typeof s.name !== 'string' || !s.name || s.name.trim() !== s.name
        || typeof s.type !== 'string' || typeof s.marked !== 'boolean'
        || typeof s.path !== 'string' || !s.path || path.isAbsolute(s.path)
        || s.path.includes('\\') || s.path.includes('\0')
        || (s.path !== '.' && s.path.split('/').some(c => !c || c === '.' || c === '..'))) throw new Error()
      const rootPath = path.resolve(root, s.path)
      if (fs.realpathSync(rootPath) !== rootPath || !fs.statSync(rootPath).isDirectory()
        || names.has(s.name) || paths.has(rootPath)) throw new Error()
      names.add(s.name); paths.add(rootPath)
      const notes = path.join(rootPath, 'notes/journals')
      return { name: s.name, type: s.type, marked: s.marked, rootPath,
        journalPath: fs.existsSync(notes) ? notes : path.join(rootPath, 'journal'),
        knowledgePath: path.join(rootPath, '3-knowledge') }
    })
  } catch {
    throw new Error('Space discovery could not be verified. Reconcile the selected core library, Python and space configuration.')
  }
}

export function personalSpace(spaces: CatalogSpace[]): CatalogSpace | null {
  // Legacy identity is permitted only for a canonical unmarked personal space.
  // An explicit team marker always overrides a directory's historical name.
  const candidates = spaces.filter(s => s.type === 'personal' || (!s.marked && s.name === 'personal'))
  if (candidates.length === 1) return candidates[0]
  // More than one space may legitimately be typed personal -- an installation
  // can hold a main personal space and, say, a practice one. That is precedence
  // to apply, not ambiguity to refuse: the documented order is
  // selected-space > personal > global, so the space actually named `personal`
  // wins. Returning null here instead disabled journal, capture and ingest
  // outright, reporting 0 entries and 0 notes on an installation holding
  // thousands.
  const named = candidates.filter(s => s.name === 'personal')
  return named.length === 1 ? named[0] : null
}
