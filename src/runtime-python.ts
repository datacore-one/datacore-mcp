/** Explicit interpreter selection shared by read-only Python integrations. */
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'

const MIN_MAJOR = 3
const MIN_MINOR = 10
// The catalog imports yaml at module top. An interpreter that cannot is unusable,
// however new it is. Probing it here turns a vague startup failure into a skip.
const PROBE = 'import sys, yaml;print("%d.%d" % sys.version_info[:2])'

export const PYTHON_UNAVAILABLE_MESSAGE =
  'No Python >=3.10 with PyYAML found. Run `datacore update` to build .datacore/venv, ' +
  'or set DATACORE_PYTHON to an absolute interpreter path that can `import yaml`.'

let cachedPython: string | null | undefined
let cachedKey: string | undefined

export function findPython(root?: string): string | null {
  const explicit = process.env.DATACORE_PYTHON
  const key = `${explicit ?? ''}\0${root ?? ''}`
  if (cachedPython !== undefined && cachedKey === key) return cachedPython
  cachedKey = key
  cachedPython = null
  if (explicit !== undefined && (!explicit || !path.isAbsolute(explicit))) return null
  const venv = root ? path.join(root, '.datacore', 'venv', 'bin', 'python') : null
  const candidates = explicit !== undefined ? [explicit] : [
    ...(venv && existsSync(venv) ? [venv] : []),
    'python3.13', 'python3.12', 'python3.11', 'python3.10',
    '/opt/homebrew/bin/python3', '/usr/local/bin/python3', 'python3',
  ]
  for (const bin of candidates) {
    try {
      const output = execFileSync(bin, ['-I', '-c', PROBE], {
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
  cachedKey = undefined
}
