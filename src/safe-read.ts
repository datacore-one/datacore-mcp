import * as fs from 'node:fs'
import * as path from 'node:path'

/** Bounded read of an unaliased regular file, with no directory creation. */
export function readTextWithin(basePath: string, filename: string, limit = 4 * 1024 * 1024): string | null {
  let fd: number | undefined
  try {
    const root = fs.realpathSync(basePath)
    const relative = path.relative(path.resolve(basePath), path.resolve(filename))
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error()
    const target = path.resolve(root, relative)
    // Missing entries are distinct from aliases or inaccessible data.
    try { fs.lstatSync(target) } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
    if (fs.realpathSync(target) !== target) throw new Error()
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const before = fs.fstatSync(fd)
    if (!before.isFile() || before.nlink !== 1 || before.size > limit) throw new Error()
    const bytes = Buffer.alloc(limit + 1)
    let length = 0, read = 0
    do { read = fs.readSync(fd, bytes, length, bytes.length - length, null); length += read }
    while (read && length < bytes.length)
    const after = fs.statSync(target), final = fs.fstatSync(fd)
    if (length > limit || fs.realpathSync(target) !== target
      || [after, final].some(s => s.dev !== before.dev || s.ino !== before.ino
        || s.size !== before.size || s.mtimeMs !== before.mtimeMs || s.nlink !== 1)) throw new Error()
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))
  } catch { throw new Error('File could not be safely read within the selected store') }
  finally { if (fd !== undefined) fs.closeSync(fd) }
}
