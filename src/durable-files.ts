/** Local file publication. OS isolation and cross-host sync are separate contracts. */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

export function directoryWithin(root: string, directory: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(directory))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('file destination is outside the selected store')
  }
  const firstCreated = fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  if (firstCreated) {
    let created = path.resolve(firstCreated)
    const selected = path.resolve(root)
    while (true) {
      syncDirectory(path.dirname(created))
      if (created === selected) break
      const next = path.relative(created, selected).split(path.sep)[0]
      created = path.join(created, next)
    }
  }
  let current = fs.realpathSync(root)
  for (const part of relative.split(path.sep).filter(Boolean)) {
    const parent = current
    current = path.join(parent, part)
    try { fs.mkdirSync(current, { mode: 0o700 }); syncDirectory(parent) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    if (!fs.lstatSync(current).isDirectory()) throw new Error('file directory is not a local directory')
  }
  return current
}

export function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

/** Publish a complete new file without replacing any existing directory entry. */
export function createText(root: string, filename: string, text: string): boolean {
  const directory = directoryWithin(root, path.dirname(filename))
  const destination = path.join(directory, path.basename(filename))
  const temporary = path.join(directory, `.datacore-pending-${randomUUID()}`)
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600)
  try {
    fs.writeFileSync(fd, text, 'utf8')
    fs.fsyncSync(fd)
  } catch (error) {
    fs.closeSync(fd); fs.unlinkSync(temporary); throw error
  }
  fs.closeSync(fd)
  try {
    try { fs.linkSync(temporary, destination) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const existing = fs.lstatSync(destination)
        if (!existing.isFile() || existing.nlink !== 1) throw new Error('existing file is not a regular single-link file')
        return false
      }
      throw error
    }
    syncDirectory(directory)
    return true
  } finally {
    fs.unlinkSync(temporary)
    syncDirectory(directory)
  }
}

/** SQLite's OS-backed writer lock is released on process death; never expires. */
export function serialized<T>(root: string, statePath: string, operation: () => T): T {
  const directory = directoryWithin(root, path.join(statePath, 'mcp-file-writes'))
  const mode = fs.lstatSync(directory)
  if (mode.mode & 0o077) throw new Error('file coordination directory is not private')
  const filename = path.join(directory, 'coordination.db')
  const fd = fs.openSync(filename, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600)
  try {
    const info = fs.fstatSync(fd)
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077)) throw new Error('invalid file coordination store')
  } finally { fs.closeSync(fd) }
  const db = new Database(filename, { timeout: 10000 })
  try {
    db.pragma('journal_mode = DELETE')
    db.pragma('synchronous = FULL')
    db.exec('BEGIN IMMEDIATE')
    const result = operation()
    db.exec('COMMIT')
    return result
  } finally { db.close() }
}

export function appendJournal(root: string, statePath: string, filename: string, header: string, entry: string): void {
  const directory = directoryWithin(root, path.dirname(filename))
  const destination = path.join(directory, path.basename(filename))
  serialized(root, statePath, () => {
    const fd = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT
      | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600)
    try {
      const before = fs.fstatSync(fd)
      if (!before.isFile() || before.nlink !== 1) throw new Error('journal is not a regular single-link file')
      const bytes = Buffer.from((before.size === 0 ? header : '') + entry, 'utf8')
      // One append never rewrites prior bytes. A short/failed append is not
      // acknowledged or retried; the next entry starts on its own heading.
      if (fs.writeSync(fd, bytes) !== bytes.length) throw new Error('incomplete journal append')
      fs.fsyncSync(fd)
      const after = fs.lstatSync(destination)
      if (before.ino !== after.ino || before.dev !== after.dev) throw new Error('journal changed during publication')
      syncDirectory(directory)
    } finally { fs.closeSync(fd) }
  })
}

export function createNote(root: string, directory: string, content: string, title: string, tags: string[] | undefined, ingested = false): string {
  const created = new Date().toISOString()
  const timestamp = created.replace(/[:.]/g, '-').slice(0, 19)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) || 'note'
  const filename = path.join(directory, `${timestamp}-${slug}-${randomUUID()}.md`)
  const metadata = `---\ntitle: ${JSON.stringify(title)}\ncreated: ${JSON.stringify(created)}\n${ingested ? 'type: ingested\n' : ''}---\n\n`
  const tagLine = tags?.length ? `\n${tags.map(tag => `#${tag}`).join(' ')}\n` : ''
  if (!createText(root, filename, `${metadata}${content}\n${tagLine}`)) throw new Error('note destination already exists')
  return filename
}
