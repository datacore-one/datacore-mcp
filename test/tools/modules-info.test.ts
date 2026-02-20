// test/tools/modules-info.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleModulesInfo } from '../../src/tools/modules-info.js'
import type { StorageConfig } from '../../src/storage.js'

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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-mcp-test-'))
  fs.mkdirSync(path.join(tmpDir, '.datacore', 'modules'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('datacore.modules.info', () => {
  it('returns error when module not found', async () => {
    const result = await handleModulesInfo({ module: 'nonexistent' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.error).toContain('not found')
    expect(result.installed_modules).toEqual([])
  })

  it('returns detailed module info', async () => {
    const modDir = path.join(tmpDir, '.datacore', 'modules', 'slides')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'module.yaml'), yaml.dump({
      manifest_version: 2,
      name: 'slides',
      version: '1.0.0',
      description: 'Presentations',
      provides: {
        tools: [{ name: 'compile_pdf', description: 'Compile' }],
        skills: [{ name: 'create-presentation' }],
      },
      engrams: { namespace: 'slides', injection_policy: 'on_match' },
    }))

    const result = await handleModulesInfo({ module: 'slides' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.name).toBe('slides')
    expect(result.version).toBe('1.0.0')
    expect(result.manifest_version).toBe(2)
    expect((result.provides as Record<string, number>).tools).toBe(1)
    expect((result.provides as Record<string, number>).skills).toBe(1)
    expect((result.engrams as Record<string, unknown>).namespace).toBe('slides')
  })

  it('lists installed module names when module not found', async () => {
    const modDir = path.join(tmpDir, '.datacore', 'modules', 'gtd')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'module.yaml'), yaml.dump({ name: 'gtd' }))

    const result = await handleModulesInfo({ module: 'slides' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.error).toContain('not found')
    expect(result.installed_modules).toEqual(['gtd'])
  })
})
