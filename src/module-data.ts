/** Private mutable module state must never be rooted in installed code. */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { directoryWithin } from './durable-files.js'
import { readTextWithin } from './safe-read.js'

export function validModuleName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(name)
}

function exists(pathname: string): boolean {
  try { fs.lstatSync(pathname); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function moduleDataPath(spaceRoot: string, name: string, installedCode: string, spaceName: string, scope?: 'global' | 'space'): string {
  if (!validModuleName(name)) throw new Error('Invalid module identifier')
  const root = fs.realpathSync(spaceRoot)
  const legacy = path.join(root, '.datacore/modules', name)
  // Global-scope modules (shared across the installation) and third-party namespaced
  // modules default to the legacy .datacore/modules/ path. A complete migration receipt
  // promotes them to the private module-data store. If the legacy path is a symlink
  // resolving outside the store root (provider-code pattern), fall back to module-data.
  if (scope === 'global' || name.includes('/')) {
    for (const component of ['data', 'state', 'settings.local.yaml']) {
      if (exists(path.join(installedCode, component))) throw new Error('Legacy module state requires verified migration')
    }
    const globalPrivate = path.join(root, '.datacore/module-data', name)
    const receiptText = readTextWithin(root, path.join(globalPrivate, '.migration.json'))
    if (receiptText !== null) {
      const migration = JSON.parse(receiptText)
      if (migration?.version === 1 && migration?.status === 'complete' && migration?.module === name) {
        return directoryWithin(root, path.join(globalPrivate, 'data'))
      }
    }
    // Global and third-party modules default to the legacy .datacore/modules/ path.
    // Only fall back to module-data if the legacy path resolves outside the store root.
    try {
      return directoryWithin(root, path.join(legacy, 'data'))
    } catch {
      // Legacy path is a symlink resolving outside store root — use module-data.
      return directoryWithin(root, path.join(globalPrivate, 'data'))
    }
  }
  // Space-scoped modules: both the legacy path and the installed code directory
  // must be free of mutable state before the private store can be created.
  for (const candidate of new Set([legacy, installedCode])) {
    if (exists(candidate)) fs.realpathSync(candidate)
    for (const component of ['data', 'state', 'settings.local.yaml']) {
      if (exists(path.join(candidate, component))) throw new Error('Legacy module state requires verified migration')
    }
  }
  const privateRoot = directoryWithin(root, path.join(root, '.datacore/module-data', name))
  let current = path.join(root, '.datacore/module-data')
  for (const component of ['', ...name.split('/')]) {
    current = path.join(current, component)
    const info = fs.statSync(current)
    if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
      throw new Error('Module state is not private to this runtime identity')
    }
  }
  const receipt = readTextWithin(root, path.join(privateRoot, '.migration.json'))
  if (receipt !== null) {
    const migration = JSON.parse(receipt)
    if (migration?.version !== 1 || migration?.status !== 'complete' || migration?.module !== name || migration?.space !== spaceName) {
      throw new Error('Module migration is incomplete')
    }
  }
  return directoryWithin(root, path.join(privateRoot, 'data'))
}
