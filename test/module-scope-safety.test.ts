import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { discoverModules, loadModuleTools } from '../src/modules.js'
import type { StorageConfig } from '../src/storage.js'

const fixtures: string[] = []
afterEach(() => {
  for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function install(scopes: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-module-scope-'))
  fixtures.push(root)
  for (const scope of scopes) {
    const mod = path.join(root, scope, '.datacore/modules/fixture')
    fs.mkdirSync(path.join(mod, 'tools'), { recursive: true })
    fs.writeFileSync(path.join(mod, 'module.yaml'),
      'name: fixture\nprovides:\n  tools:\n    - name: identify\n      description: Identify the data scope\n')
    fs.writeFileSync(path.join(mod, 'tools/index.js'),
      'export const tools = [{ name: "identify", description: "fixture", ' +
      'inputSchema: {type: "object", properties: {}}, ' +
      'handler: async (_args, context) => ({ dataPath: context.dataPath }) }];\n')
  }
  return { mode: 'full', basePath: root } as StorageConfig
}

describe('module routing is unambiguous', () => {
  it.each([['', '1-team'], ['0-personal', '1-team']])(
    'does not expose the same callable name for %s and %s', async (first, second) => {
      const storage = install([first, second])
      const tools = await loadModuleTools(discoverModules(storage), storage)
      // The server dispatches by name only. Duplicate names make one listed
      // data scope silently call another handler through Array.find().
      const names = tools.map(tool => tool.fullName)
      expect(tools).toHaveLength(2)
      expect(new Set(names).size).toBe(names.length)
      for (const tool of tools) {
        const response = await tool.definition.handler({}, tool.context) as { dataPath: string }
        expect(response.dataPath).toBe(path.join(storage.basePath,
          tool.context.spaceName ?? '0-personal', '.datacore/modules/fixture/data'))
      }
    },
  )

  it('preserves callable identity when discovery order changes', async () => {
    const storage = install(['', '0-personal', '1-team'])
    const modules = discoverModules(storage)
    const snapshot = async (providers: typeof modules) => {
      const tools = await loadModuleTools(providers, storage)
      return Object.fromEntries(tools.map(tool => [tool.fullName, tool.context.dataPath]))
    }
    expect(await snapshot(modules)).toEqual(await snapshot([...modules].reverse()))
  })

  it('refuses a core name collision while retaining unrelated scoped tools', async () => {
    const storage = install(['', '1-team'])
    const tools = await loadModuleTools(discoverModules(storage), storage, ['datacore_fixture_identify'])
    expect(tools.map(tool => tool.fullName)).toEqual(['datacore_1-team_fixture_identify'])
  })

  it('refuses duplicate manifests without disabling other data scopes', async () => {
    const storage = install(['', '1-team'])
    const original = path.join(storage.basePath, '.datacore/modules/fixture')
    fs.cpSync(original, path.join(storage.basePath, '.datacore/modules/duplicate'), { recursive: true })
    const tools = await loadModuleTools(discoverModules(storage), storage)
    expect(tools.map(tool => tool.fullName)).toEqual(['datacore_1-team_fixture_identify'])
  })

  it('uses the documented third-party namespace and preserves its existing data path', async () => {
    const storage = install([''])
    const modules = discoverModules(storage)
    modules[0].name = modules[0].manifest.name = 'acme/fixture'
    const tools = await loadModuleTools(modules, storage)
    expect(tools.map(tool => tool.fullName)).toEqual(['datacore_acme-fixture_identify'])
    expect(tools[0].context.dataPath).toBe(path.join(storage.basePath,
      '0-personal/.datacore/modules/acme/fixture/data'))
  })

  it.each(['../fixture', '/fixture', 'acme/../fixture', 'fixture.name', '', 12])(
    'refuses invalid module identifier %s without losing other tools', async name => {
      const storage = install(['', '1-team'])
      const modules = discoverModules(storage)
      modules[0].name = name as string
      const tools = await loadModuleTools(modules, storage)
      expect(tools.map(tool => tool.fullName)).toEqual(['datacore_1-team_fixture_identify'])
    },
  )

  it('rejects overlong callable names without truncating them into collisions', async () => {
    const storage = install(['', '1-team'])
    const modules = discoverModules(storage)
    modules[0].name = 'a'.repeat(64)
    const tools = await loadModuleTools(modules, storage)
    expect(tools.map(tool => tool.fullName)).toEqual(['datacore_1-team_fixture_identify'])
  })

  it('rejects collisions after third-party namespace normalization', async () => {
    const storage = install([''])
    const modules = discoverModules(storage)
    const original = modules[0]
    const tools = await loadModuleTools([
      { ...original, name: 'acme/fixture' }, { ...original, name: 'acme-fixture' },
    ], storage)
    expect(tools).toEqual([])
  })
})
