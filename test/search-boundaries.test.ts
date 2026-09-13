import { afterEach, beforeEach, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import Database from 'better-sqlite3'
import { handleSearch } from '../src/tools/search.js'
let root: string
beforeEach(() => { root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-search-boundary-'))) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
function space(name: string) {
  const rootPath = path.join(root, name), journalPath = path.join(rootPath, 'journal'), knowledgePath = path.join(rootPath, 'knowledge')
  fs.mkdirSync(journalPath, { recursive: true }); fs.mkdirSync(knowledgePath, { recursive: true })
  return { name, rootPath, journalPath, knowledgePath }
}
it.each(['symlink', 'hardlink'])('search cannot disclose another store through a %s', async kind => {
  const s = space('selected'), outside = path.join(root, 'private.md')
  fs.writeFileSync(outside, 'needle synthetic private content')
  const note = path.join(s.knowledgePath, 'link.md')
  if (kind === 'symlink') fs.symlinkSync(outside, note); else fs.linkSync(outside, note)
  const result = await handleSearch({ query: 'needle' }, { ...s, spaces: [s] })
  expect(JSON.stringify(result)).not.toContain('synthetic private content')
  expect(result.fallback_warning).toMatch(/incomplete/i)
})
it('one indexed space cannot suppress matching files in an unindexed space', async () => {
  const a = space('indexed'), b = space('unindexed')
  fs.writeFileSync(path.join(a.knowledgePath, 'first.md'), '# First\nneedle first')
  fs.writeFileSync(path.join(b.knowledgePath, 'second.md'), '# Second\nneedle second')
  fs.mkdirSync(path.join(a.rootPath, '.datacore'))
  const db = new Database(path.join(a.rootPath, '.datacore/knowledge.db'))
  try {
    db.exec('CREATE TABLE files (path TEXT, title TEXT, type TEXT, is_stub INTEGER); CREATE VIRTUAL TABLE files_fts USING fts5(title, content);')
    db.prepare('INSERT INTO files VALUES (?, ?, ?, 0)').run(path.join(a.knowledgePath, 'first.md'), 'First', 'knowledge')
    db.prepare('INSERT INTO files_fts VALUES (?, ?)').run('First', 'needle first')
  } finally { db.close() }
  const result = await handleSearch({ query: 'needle' }, { ...a, spaces: [a, b] })
  expect(result.results.map(r => r.path).sort()).toEqual([path.join(a.knowledgePath, 'first.md'), path.join(b.knowledgePath, 'second.md')].sort())
})
it('replaced files with preserved mtimes cannot return old cached contents', async () => {
  const s = space('selected'), note = path.join(s.knowledgePath, 'note.md')
  fs.writeFileSync(note, 'needle old private content')
  fs.utimesSync(note, new Date(1000), new Date(1000))
  await handleSearch({ query: 'needle' }, { ...s, spaces: [s] })
  fs.writeFileSync(note + '.new', 'needle new public content')
  fs.utimesSync(note + '.new', new Date(1000), new Date(1000)); fs.renameSync(note + '.new', note)
  const result = await handleSearch({ query: 'needle' }, { ...s, spaces: [s] })
  expect(result.results[0].snippet).toContain('new public')
  expect(result.results[0].snippet).not.toContain('old private')
})

it('does not read a linked search index from another store', async () => {
  const s = space('selected'), outside = path.join(root, 'outside')
  fs.mkdirSync(outside)
  const target = path.join(s.rootPath, 'other.md')
  fs.writeFileSync(target, 'ordinary selected file')
  const db = new Database(path.join(outside, 'knowledge.db'))
  try {
    db.exec('CREATE TABLE files (path TEXT, title TEXT, type TEXT, is_stub INTEGER); CREATE VIRTUAL TABLE files_fts USING fts5(title, content);')
    db.prepare('INSERT INTO files VALUES (?, ?, ?, 0)').run(target, 'Other', 'knowledge')
    db.prepare('INSERT INTO files_fts VALUES (?, ?)').run('Other', 'needle synthetic secret in outside index')
  } finally { db.close() }
  fs.symlinkSync(outside, path.join(s.rootPath, '.datacore'))
  const result = await handleSearch({ query: 'needle' }, { ...s, spaces: [s] })
  expect(JSON.stringify(result)).not.toContain('synthetic secret')
  expect(result.fallback_warning).toMatch(/incomplete/i)
})

it('reports oversized or nonregular inputs without hanging or claiming complete coverage', async () => {
  const s = space('selected')
  fs.writeFileSync(path.join(s.knowledgePath, 'oversized.md'), 'needle' + 'x'.repeat(4 * 1024 * 1024))
  const result = await handleSearch({ query: 'needle' }, { ...s, spaces: [s] })
  expect(result.results).toEqual([])
  expect(result.fallback_warning).toMatch(/incomplete/i)
})
