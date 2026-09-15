import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { detectStorage } from '../src/storage.js'
import { discoverModules, loadModuleTools } from '../src/modules.js'
import { handleCapture } from '../src/tools/capture.js'
import { handleIngest } from '../src/tools/ingest.js'
import { handleModulesInfo } from '../src/tools/modules-info.js'

let root: string
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-space-catalog-')))
  fs.mkdirSync(path.join(root, '.datacore'))
  vi.stubEnv('DATACORE_SCOPED_MODULE_NAMES', '1')
  vi.stubEnv('DATACORE_PATH', root)
  vi.stubEnv('DATACORE_CORE_PATH', undefined)
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })

function marker(relative: string, name: string, type = 'team') {
  const directory = path.join(root, relative, '.datacore')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'config.yaml'), `space:\n  name: ${name}\n  type: ${type}\n`)
}
function moduleAt(relative: string) {
  const directory = path.join(root, relative, '.datacore/modules/fixture')
  fs.mkdirSync(path.join(directory, 'tools'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'module.yaml'), 'name: fixture\nprovides:\n  tools:\n    - name: identify\n')
  fs.writeFileSync(path.join(directory, 'tools/index.js'), 'export const tools=[{name:"identify",inputSchema:{type:"object"},handler:async(_,ctx)=>ctx.dataPath}];')
}

it('discovers root, named, nested and multi-digit spaces by canonical identity', () => {
  marker('.', 'self', 'personal'); marker('named/group/client', 'client', 'client'); marker('12-renamed', 'stable')
  expect(detectStorage().spaces.map(s => s.name).sort()).toEqual(['client', 'self', 'stable'])
})

it('does not publish private capture or ingest into the first available team space', async () => {
  marker('1-team', 'team')
  const storage = detectStorage()
  expect((await handleCapture({ type: 'journal', content: 'synthetic private note' }, storage)).success).toBe(false)
  expect((await handleIngest({ content: 'synthetic private note' }, storage)).success).toBe(false)
  expect(fs.existsSync(path.join(root, '1-team/journal'))).toBe(false)
  expect(fs.existsSync(path.join(root, '1-team/3-knowledge'))).toBe(false)
})

it('does not use a directory named personal when its marker says team', async () => {
  marker('0-personal', 'personal', 'team')
  expect((await handleCapture({ type: 'knowledge', content: 'private' }, detectStorage())).success).toBe(false)
})

it('refuses ambiguous personal destinations instead of picking one', async () => {
  marker('1-first', 'first', 'personal'); marker('2-second', 'second', 'personal')
  expect((await handleCapture({ type: 'journal', content: 'private' }, detectStorage())).success).toBe(false)
})

it('routes renamed personal and nested module data to their actual canonical paths', async () => {
  marker('named-self', 'self', 'personal'); marker('group/nested', 'client', 'client')
  moduleAt(''); moduleAt('group/nested')
  const storage = detectStorage()
  const tools = await loadModuleTools(discoverModules(storage), storage)
  expect(tools.map(t => t.fullName).sort()).toEqual(['datacore_client_fixture_identify', 'datacore_fixture_identify'])
  expect(tools.find(t => t.fullName === 'datacore_fixture_identify')?.context.dataPath).toBe(path.join(root, 'named-self/.datacore/module-data/fixture/data'))
  expect(tools.find(t => t.fullName === 'datacore_client_fixture_identify')?.context.dataPath).toBe(path.join(root, 'group/nested/.datacore/module-data/fixture/data'))
  const captured = await handleCapture({ type: 'journal', content: 'private' }, storage)
  expect(captured.success).toBe(true)
  expect(captured.path?.startsWith(path.join(root, 'named-self/journal/'))).toBe(true)
})

it('refuses malformed or duplicate identities rather than returning a partial catalog', () => {
  marker('first', 'same'); marker('second', 'same')
  expect(() => detectStorage()).toThrow()
})

it('refuses writes after the personal identity is reassigned to a team', async () => {
  marker('0-personal', 'personal', 'personal')
  const storage = detectStorage()
  marker('0-personal', 'personal', 'team')
  expect((await handleCapture({ type: 'knowledge', content: 'private' }, storage)).success).toBe(false)
  expect((await handleIngest({ content: 'private' }, storage)).success).toBe(false)
})

it('preserves tool identity after an ordinal changes and refuses ambiguous info', async () => {
  marker('0-personal', 'self', 'personal'); marker('1-work', 'work')
  moduleAt(''); moduleAt('1-work')
  const before = detectStorage(), modules = discoverModules(before)
  expect((await handleModulesInfo({ module: 'fixture' }, before, modules) as any).error).toMatch(/ambiguous/)
  const names = (await loadModuleTools(modules, before)).map(t => t.fullName).sort()
  fs.renameSync(path.join(root, '1-work'), path.join(root, '22-work'))
  const after = detectStorage()
  const tools = await loadModuleTools(discoverModules(after), after)
  expect(tools.map(t => t.fullName).sort()).toEqual(names)
  expect(tools.find(t => t.fullName === 'datacore_work_fixture_identify')?.context.dataPath).toBe(path.join(root, '22-work/.datacore/module-data/fixture/data'))
})

it.each([
  { version: 2, spaces: [] }, { version: 1, spaces: {} },
  { version: 1, error: 'synthetic private detail', spaces: [] },
  ...['../outside', '/outside', 'a/../b', 'a//b', 'a\\b'].map(p => ({ version: 1,
    spaces: [{ path: p, name: 'self', type: 'personal', marked: true }] })),
  { version: 1, spaces: [{ path: '.', name: 'self', type: 'personal', marked: 'true' }] },
])('rejects malformed installed-helper responses without leaking diagnostics %#', response => {
  const library = path.join(root, 'installed-lib'); fs.mkdirSync(library)
  fs.writeFileSync(path.join(library, 'space_catalog.py'), `print(${JSON.stringify(JSON.stringify(response))})`)
  vi.stubEnv('DATACORE_LIB', library)
  expect(() => detectStorage()).toThrow(/discovery could not be verified/)
})

it('does not import global handlers without a verified personal destination', async () => {
  marker('named-team', 'team'); moduleAt('')
  const storage = detectStorage()
  expect(await loadModuleTools(discoverModules(storage), storage)).toEqual([])
})
