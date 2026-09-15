import { afterEach, beforeEach, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { registerResources } from '../src/resources.js'
let root: string
let read: (request: unknown) => Promise<any>
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-journal-resource-'))
  fs.mkdirSync(path.join(root, 'journal'))
  const handlers: any[] = []
  registerResources({ setRequestHandler: (_: unknown, handler: unknown) => handlers.push(handler) } as any,
    { mode: 'core', basePath: root, journalPath: path.join(root, 'journal') } as any)
  read = handlers[2]
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('refuses traversal instead of disclosing another file', async () => {
  fs.writeFileSync(path.join(root, 'private.md'), 'synthetic private content')
  await expect(read({ params: { uri: 'datacore://journal/../private' } })).rejects.toThrow()
})

it('refuses journal symlinks and hard links', async () => {
  fs.writeFileSync(path.join(root, 'private.md'), 'synthetic private content')
  const note = path.join(root, 'journal/2026-01-01.md')
  fs.symlinkSync(path.join(root, 'private.md'), note)
  await expect(read({ params: { uri: 'datacore://journal/2026-01-01' } })).rejects.toThrow()
  fs.unlinkSync(note); fs.linkSync(path.join(root, 'private.md'), note)
  await expect(read({ params: { uri: 'datacore://journal/2026-01-01' } })).rejects.toThrow()
})

it('returns a normal journal and an explicit missing entry', async () => {
  fs.writeFileSync(path.join(root, 'journal/2026-01-01.md'), 'normal entry')
  expect((await read({ params: { uri: 'datacore://journal/2026-01-01' } })).contents[0].text).toBe('normal entry')
  expect((await read({ params: { uri: 'datacore://journal/2026-01-02' } })).contents[0].text).toContain('No journal entry')
})

it.each(['2026-02-30', '2026-01-01/../../private', '%2e%2e/private', '2026-1-1'])('refuses malformed date %s', async date => {
  await expect(read({ params: { uri: `datacore://journal/${date}` } })).rejects.toThrow()
})

it('refuses aliased journal directories, oversized entries and invalid UTF-8', async () => {
  const directory = path.join(root, 'journal')
  fs.rmdirSync(directory); fs.mkdirSync(path.join(root, 'elsewhere'))
  fs.writeFileSync(path.join(root, 'elsewhere/2026-01-01.md'), 'private')
  fs.symlinkSync(path.join(root, 'elsewhere'), directory)
  await expect(read({ params: { uri: 'datacore://journal/2026-01-01' } })).rejects.toThrow()
  fs.unlinkSync(directory); fs.mkdirSync(directory)
  const note = path.join(directory, '2026-01-01.md')
  fs.writeFileSync(note, Buffer.alloc(4 * 1024 * 1024 + 1))
  await expect(read({ params: { uri: 'datacore://journal/2026-01-01' } })).rejects.toThrow()
  fs.writeFileSync(note, Buffer.from([0xff]))
  await expect(read({ params: { uri: 'datacore://journal/2026-01-01' } })).rejects.toThrow()
})
