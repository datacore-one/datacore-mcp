// test/tools/modules-list.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleModulesList } from '../../src/tools/modules-list.js'
import type { StorageConfig } from '../../src/storage.js'

let tmpDir: string

function makeStorage(basePath: string, mode: 'full' | 'standalone' = 'full'): StorageConfig {
  return {
    mode,
    basePath,
    engramsPath: path.join(basePath, '.datacore', 'learning', 'engrams.yaml'),
    journalPath: path.join(basePath, '0-personal', 'journal'),
    knowledgePath: path.join(basePath, '0-personal', '3-knowledge'),
    packsPath: path.join(basePath, '.datacore', 'learning', 'packs'),
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-mcp-test-'))
  fs.mkdirSync(path.join(tmpDir, '.datacore', 'modules'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('datacore.modules.list', () => {
  it('returns empty list when no modules installed', async () => {
    const result = await handleModulesList({}, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.count).toBe(0)
    expect(result.modules).toEqual([])
  })

  it('returns message in standalone mode', async () => {
    const result = await handleModulesList({}, makeStorage(tmpDir, 'standalone')) as Record<string, unknown>
    expect(result.count).toBe(0)
    expect(result.message).toContain('full Datacore installation')
  })

  it('lists installed modules with capability counts', async () => {
    const modDir = path.join(tmpDir, '.datacore', 'modules', 'gtd')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'module.yaml'), yaml.dump({
      manifest_version: 2,
      name: 'gtd',
      version: '1.0.0',
      description: 'Getting Things Done',
      builtin: true,
      provides: {
        tools: [{ name: 'inbox_count' }, { name: 'add_task' }],
        agents: [{ name: 'inbox-processor' }],
        commands: ['gtd-daily-start'],
      },
      context: { priority: 'always' },
    }))

    const result = await handleModulesList({}, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.count).toBe(1)

    const modules = result.modules as Array<Record<string, unknown>>
    expect(modules[0].name).toBe('gtd')
    expect(modules[0].version).toBe('1.0.0')
    expect(modules[0].builtin).toBe(true)
    expect(modules[0].provides).toEqual({
      tools: 2, skills: 0, agents: 1, commands: 1, workflows: 0,
    })
    expect(modules[0].context_priority).toBe('always')
  })
})
