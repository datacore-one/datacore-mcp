import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleCommandList, handleCommandRun, resolveCommandFile } from '../../src/tools/commands.js'
import type { StorageConfig } from '../../src/storage.js'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'portable-commands-'))
  roots.push(root)
  const dir = join(root, '.datacore', 'commands')
  mkdirSync(dir, { recursive: true })
  const body = '\n# Search\n\nFind $ARGUMENTS without changing the workflow.\n'
  writeFileSync(join(dir, 'search.md'), '---\nname: search\ndescription: Search notes\nrecall:\n  description: Nested description\n---\n' + body)
  return { root, dir, body, storage: { basePath: root, mode: 'full' } as StorageConfig }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('portable command loading', () => {
  it('keeps arguments as data and the canonical workflow unchanged', () => {
    const { storage, body, root } = fixture()
    const args = 'project with spaces; $(do-not-execute) "quoted"\nsecond line'
    const loaded = handleCommandRun({ command: '/search', arguments: args }, storage)
    expect(loaded.command).toBe('search')
    expect(loaded.arguments).toBe(args)
    expect(loaded.instructions).toBe(body)
    expect(loaded.description).toBe('Search notes')
    expect(loaded.execution.working_directory).toBe(root)
    expect(resolveCommandFile('/search', storage)).toBe(loaded.source)
    expect(handleCommandRun({ command: 'search' }, storage).arguments).toBe('')
  })

  it('retains commands without exposing them as user shortcuts', () => {
    const { storage, dir } = fixture()
    writeFileSync(join(dir, 'internal.md'), '---\nuser-invocable: false\n---\nInternal procedure.')
    writeFileSync(join(dir, 'legacy.md'), '---\nuser_invocable: false\n---\nLegacy procedure.')
    const listed = handleCommandList({}, storage).commands
    expect(listed.find(c => c.name === 'internal')?.user_invocable).toBe(false)
    expect(listed.find(c => c.name === 'legacy')?.user_invocable).toBe(false)
    expect(handleCommandRun({ command: 'internal' }, storage).instructions).toBe('Internal procedure.')
  })

  it('resolves only command names, never paths or a whole invocation', () => {
    const { storage, root, dir } = fixture()
    writeFileSync(join(root, '.datacore', 'outside.md'), 'Not a command')
    mkdirSync(join(dir, 'directory.md'))
    for (const command of ['../outside', 'search project', 'directory', '//search']) {
      expect(() => handleCommandRun({ command }, storage)).toThrow(/Unknown command/)
    }
  })

  it('keeps legacy prompt headers with unquoted colons discoverable', () => {
    const { storage, dir } = fixture()
    writeFileSync(join(dir, 'legacy.md'), '---\ndescription: Continue: saved work\nuser_invocable: false\nrecall:\n  description: Do not replace top-level text\n---\nRun it.')
    expect(handleCommandList({}, storage).commands.find(c => c.name === 'legacy'))
      .toEqual({ name: 'legacy', description: 'Continue: saved work', user_invocable: false })
    expect(handleCommandRun({ command: 'legacy' }, storage).instructions).toBe('Run it.')
  })
})
