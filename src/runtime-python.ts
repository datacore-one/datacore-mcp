/** Explicit interpreter selection shared by read-only Python integrations. */
import { execFileSync } from 'child_process'
import * as path from 'path'

const MIN_MAJOR = 3
const MIN_MINOR = 10

let cachedPython: string | null | undefined
let cachedSelection: string | undefined

export function findPython(): string | null {
  const explicit = process.env.DATACORE_PYTHON
  if (cachedPython !== undefined && cachedSelection === explicit) return cachedPython
  cachedSelection = explicit
  cachedPython = null
  if (explicit !== undefined && (!explicit || !path.isAbsolute(explicit))) return null
  const candidates = explicit !== undefined ? [explicit] : [
    'python3.13', 'python3.12', 'python3.11', 'python3.10',
    '/opt/homebrew/bin/python3', '/usr/local/bin/python3', 'python3',
  ]
  for (const bin of candidates) {
    try {
      const output = execFileSync(bin, ['-I', '-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], {
        encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      const match = /^(\d+)\.(\d+)$/.exec(output)
      if (match && (Number(match[1]) > MIN_MAJOR || (Number(match[1]) === MIN_MAJOR && Number(match[2]) >= MIN_MINOR))) {
        cachedPython = bin
        return bin
      }
    } catch { /* Failure of an explicit selection never enables fallback. */ }
  }
  return null
}

export function resetPythonCache(): void {
  cachedPython = undefined
  cachedSelection = undefined
}
