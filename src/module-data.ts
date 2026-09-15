/** Code and private data are strictly separate. Data belongs to the space that uses the module. */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { directoryWithin } from './durable-files.js'
import { readTextWithin } from './safe-read.js'

/** Anything a module may hold that is state rather than code. */
const STATE = ['data', 'state', 'settings.local.yaml']

export function validModuleName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(name)
}

function exists(pathname: string): boolean {
  try { fs.lstatSync(pathname); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * Private state directory for a module, inside the space that uses it.
 *
 * The store is always `<space>/.datacore/module-data/<name>/data`, never a
 * directory under installed code. Keeping it in the using space is what makes
 * it back up with that space and reach the team that owns it; a module
 * installed once at the installation root still writes into each space that
 * uses it, rather than into a single shared directory beside its code.
 *
 * Existing state next to code is preserved, not superseded: a legacy `data/`
 * with no completed migration receipt is refused rather than shadowed by a new
 * empty store, because a silently empty store reads to a module as "no data
 * yet" and it writes a fresh history over the top. Performing the migration is
 * an explicit, quiesced operation; this resolver only refuses to paper over it.
 */
export function moduleDataPath(spaceRoot: string, name: string, installedCode: string, spaceName: string): string {
  if (!validModuleName(name)) throw new Error('Invalid module identifier')
  const root = fs.realpathSync(spaceRoot)
  const store = path.join(root, '.datacore/module-data', name)

  // Legacy locations, in precedence order: state inside the installed code
  // directory itself, and the historical `<space>/.datacore/modules/<name>`.
  // A symlinked provider checkout resolves into someone else's repository, so
  // its contents count as code, never as this space's private store.
  const legacy = path.join(root, '.datacore/modules', name)
  const receiptText = readTextWithin(root, path.join(store, '.migration.json'))
  let migrated = false
  if (receiptText !== null) {
    const receipt = JSON.parse(receiptText)
    if (receipt?.version !== 1 || receipt?.status !== 'complete'
      || receipt?.module !== name || receipt?.space !== spaceName) {
      throw new Error('Module migration is incomplete')
    }
    migrated = true
  }
  if (!migrated) {
    for (const candidate of new Set([legacy, installedCode])) {
      if (exists(candidate)) fs.realpathSync(candidate)
      for (const component of STATE) {
        if (exists(path.join(candidate, component))) {
          throw new Error(`Module state still sits beside code at ${path.join(candidate, component)}; `
            + 'it needs a completed migration into the space module-data store')
        }
      }
    }
  }

  // The store and every directory leading to it must be private to this
  // runtime identity, and must not be an alias pointing back into code.
  let current = path.join(root, '.datacore/module-data')
  for (const component of ['', ...name.split('/')]) {
    current = path.join(current, component)
    if (!exists(current)) break
    const info = fs.lstatSync(current)
    if (!info.isDirectory()) throw new Error('Module state directory is aliased or invalid')
    if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
      throw new Error('Module state is not private to this runtime identity')
    }
  }
  const resolved = directoryWithin(root, path.join(store, 'data'))
  if (!path.relative(path.resolve(installedCode), path.resolve(resolved)).startsWith('..')) {
    throw new Error('Module data cannot be stored inside installed code')
  }
  return resolved
}
