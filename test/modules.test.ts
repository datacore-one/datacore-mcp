// test/modules.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { discoverModules, loadModuleTools, getModuleInfo, type ModuleManifest } from '../src/modules.js'
import type { StorageConfig } from '../src/storage.js'

let tmpDir: string

function makeStorage(basePath: string): StorageConfig {
  return {
    mode: 'full',
    basePath,
    engramsPath: path.join(basePath, '.datacore', 'learning', 'engrams.yaml'),
    journalPath: path.join(basePath, '0-personal', 'journal'),
    knowledgePath: path.join(basePath, '0-personal', '3-knowledge'),
    packsPath: path.join(basePath, '.datacore', 'learning', 'packs'),
  }
}

function writeModuleYaml(dir: string, manifest: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'module.yaml'), yaml.dump(manifest))
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-mcp-test-'))
  // Create .datacore so it's detected as full mode
  fs.mkdirSync(path.join(tmpDir, '.datacore', 'modules'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('discoverModules', () => {
  it('returns empty array in core mode', () => {
    const storage = { ...makeStorage(tmpDir), mode: 'core' as const }
    const modules = discoverModules(storage)
    expect(modules).toEqual([])
  })

  it('discovers global modules', () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'gtd'), {
      name: 'gtd',
      version: '1.0.0',
      description: 'Getting Things Done',
    })

    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('gtd')
    expect(modules[0].scope).toBe('global')
    expect(modules[0].spaceName).toBeUndefined()
  })

  it('discovers space-scoped modules', () => {
    const spaceModDir = path.join(tmpDir, '1-teamspace', '.datacore', 'modules', 'crm')
    writeModuleYaml(spaceModDir, {
      name: 'crm',
      version: '1.0.0',
      description: 'Contact management',
    })

    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('crm')
    expect(modules[0].scope).toBe('space')
    expect(modules[0].spaceName).toBe('1-teamspace')
  })

  it('discovers both global and space modules', () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'gtd'), {
      name: 'gtd', version: '1.0.0',
    })
    writeModuleYaml(path.join(tmpDir, '0-personal', '.datacore', 'modules', 'trading'), {
      name: 'trading', version: '1.0.0',
    })

    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(2)
    const names = modules.map(m => m.name).sort()
    expect(names).toEqual(['gtd', 'trading'])
  })

  it('skips directories without module.yaml', () => {
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'modules', 'empty'), { recursive: true })

    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(0)
  })

  it('skips modules with invalid YAML', () => {
    const modDir = path.join(tmpDir, '.datacore', 'modules', 'broken')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'module.yaml'), '{{invalid yaml')

    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(0)
  })

  it('skips modules without a name field', () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'nameless'), {
      version: '1.0.0',
      description: 'No name',
    })

    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(0)
  })
})

describe('loadModuleTools', () => {
  it('returns empty when module declares no tools', async () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'gtd'), {
      name: 'gtd',
      provides: { agents: [{ name: 'inbox-processor' }] },
    })

    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))
    expect(tools).toHaveLength(0)
  })

  it('returns empty when tools/index.js does not exist', async () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'gtd'), {
      name: 'gtd',
      provides: {
        tools: [{ name: 'inbox_count', description: 'Count inbox items', handler: 'tools/inbox_count.ts' }],
      },
    })

    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))
    expect(tools).toHaveLength(0)
  })

  it('loads tools from a module with tools/index.js', async () => {
    const modDir = path.join(tmpDir, '.datacore', 'modules', 'gtd')
    writeModuleYaml(modDir, {
      name: 'gtd',
      provides: {
        tools: [{ name: 'inbox_count', description: 'Count inbox items', handler: 'tools/inbox_count.ts' }],
      },
    })

    // Write a tools/index.js that exports a tools array
    const toolsDir = path.join(modDir, 'tools')
    fs.mkdirSync(toolsDir, { recursive: true })
    fs.writeFileSync(path.join(toolsDir, 'index.js'), `
      import { z } from 'zod';
      export const tools = [{
        name: 'inbox_count',
        description: 'Count inbox items',
        inputSchema: z.object({}),
        handler: async (args, ctx) => ({ count: 42 }),
      }];
    `)

    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))

    expect(tools).toHaveLength(1)
    expect(tools[0].fullName).toBe('datacore.gtd.inbox_count')
    expect(tools[0].moduleName).toBe('gtd')

    // Verify the handler works
    const result = await tools[0].definition.handler({}, tools[0].context)
    expect(result).toEqual({ count: 42 })
  })

  it('only registers tools declared in module.yaml', async () => {
    const modDir = path.join(tmpDir, '.datacore', 'modules', 'gtd')
    writeModuleYaml(modDir, {
      name: 'gtd',
      provides: {
        tools: [{ name: 'inbox_count', description: 'Count inbox items', handler: 'tools/inbox_count.ts' }],
      },
    })

    const toolsDir = path.join(modDir, 'tools')
    fs.mkdirSync(toolsDir, { recursive: true })
    // Export two tools, but only one is declared in module.yaml
    fs.writeFileSync(path.join(toolsDir, 'index.js'), `
      import { z } from 'zod';
      export const tools = [
        { name: 'inbox_count', description: 'Count', inputSchema: z.object({}), handler: async () => ({ count: 1 }) },
        { name: 'secret_tool', description: 'Undeclared', inputSchema: z.object({}), handler: async () => ({ secret: true }) },
      ];
    `)

    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))

    expect(tools).toHaveLength(1)
    expect(tools[0].fullName).toBe('datacore.gtd.inbox_count')
  })

  it('sets correct data path for space-scoped modules', async () => {
    const spaceModDir = path.join(tmpDir, '1-team', '.datacore', 'modules', 'crm')
    writeModuleYaml(spaceModDir, {
      name: 'crm',
      provides: {
        tools: [{ name: 'lookup', description: 'Lookup contact', handler: 'tools/lookup.ts' }],
      },
    })

    const toolsDir = path.join(spaceModDir, 'tools')
    fs.mkdirSync(toolsDir, { recursive: true })
    fs.writeFileSync(path.join(toolsDir, 'index.js'), `
      import { z } from 'zod';
      export const tools = [{
        name: 'lookup',
        description: 'Lookup contact',
        inputSchema: z.object({ name: z.string() }),
        handler: async (args, ctx) => ({ path: ctx.dataPath }),
      }];
    `)

    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))

    expect(tools).toHaveLength(1)
    expect(tools[0].context.dataPath).toBe(
      path.join(tmpDir, '1-team', '.datacore', 'modules', 'crm', 'data')
    )
    expect(tools[0].context.spaceName).toBe('1-team')
  })
})

describe('getModuleInfo', () => {
  it('returns structured info for a module', () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'slides'), {
      manifest_version: 2,
      name: 'slides',
      version: '1.0.0',
      description: 'Presentations with AI backgrounds',
      provides: {
        tools: [
          { name: 'compile_pdf', description: 'Compile PDF', handler: 'tools/compile.ts' },
          { name: 'list_templates', description: 'List templates', handler: 'tools/list.ts' },
        ],
        skills: [{ name: 'create-presentation' }],
        agents: [{ name: 'presentation-generator' }],
        commands: ['create-presentation'],
        workflows: [{ name: 'create-presentation' }],
      },
      context: { priority: 'minimal', summary: 'Presentations with AI backgrounds' },
      engrams: {
        namespace: 'slides',
        injection_policy: 'on_match',
        starter_pack: 'engrams/engrams.yaml',
        match_terms: ['presentation', 'slides'],
      },
      requires: { env_vars: { required: ['GEMINI_API_KEY'], optional: ['GAMMA_API_KEY'] } },
    })

    const modules = discoverModules(makeStorage(tmpDir))
    const info = getModuleInfo(modules[0])

    expect(info.name).toBe('slides')
    expect(info.version).toBe('1.0.0')
    expect(info.manifest_version).toBe(2)
    expect(info.provides).toEqual({
      tools: 2, skills: 1, agents: 1, commands: 1, workflows: 1,
    })
    expect(info.context_priority).toBe('minimal')
    expect((info.engrams as Record<string, unknown>).namespace).toBe('slides')
    expect((info.requires as Record<string, unknown>).env_required).toEqual(['GEMINI_API_KEY'])
  })

  it('handles minimal module manifest', () => {
    writeModuleYaml(path.join(tmpDir, '.datacore', 'modules', 'minimal'), {
      name: 'minimal',
    })

    const modules = discoverModules(makeStorage(tmpDir))
    const info = getModuleInfo(modules[0])

    expect(info.name).toBe('minimal')
    expect(info.version).toBe('0.0.0')
    expect(info.manifest_version).toBe(1)
    expect(info.provides).toEqual({ tools: 0, skills: 0, agents: 0, commands: 0, workflows: 0 })
    expect(info.context_priority).toBe('minimal')
    expect(info.engrams).toBeNull()
    expect(info.requires).toBeNull()
  })
})
