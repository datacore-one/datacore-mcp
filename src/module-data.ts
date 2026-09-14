/** Python and MCP share the same preservation-first module data resolver. */
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { findPython } from './runtime-python.js'

export function validModuleName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(name)
}

export function moduleDataPath(spaceRoot: string, name: string, installedCode: string, spaceName: string): string {
  if (!validModuleName(name)) throw new Error('Invalid module identifier')
  const python = findPython()
  const library = process.env.DATACORE_LIB
    ?? path.join(process.env.DATACORE_PATH ?? spaceRoot, '.datacore/lib')
  if (!python || !path.isAbsolute(library)) throw new Error('Installed module data resolver is unavailable')
  try {
    const result = JSON.parse(execFileSync(python, ['-I', path.join(library, 'module_context.py'),
      '--space-root', spaceRoot, '--space-name', spaceName, '--module', name, '--code', installedCode], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
    const relative = typeof result.data_path === 'string' ? path.relative(spaceRoot, result.data_path) : '..'
    if (result.version !== 1 || !relative || relative === '..' || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative) || !path.isAbsolute(result.data_path)) throw new Error()
    return result.data_path
  } catch {
    throw new Error('Module data requires private, unambiguous storage or preserved migration')
  }
}
