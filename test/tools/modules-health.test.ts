// test/tools/modules-health.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleModulesHealth } from '../../src/tools/modules-health.js'
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

function writeModule(name: string, manifest: Record<string, unknown>, extras?: { skillMd?: boolean; claudeMd?: boolean }): string {
  const modDir = path.join(tmpDir, '.datacore', 'modules', name)
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, 'module.yaml'), yaml.dump(manifest))
  if (extras?.skillMd) fs.writeFileSync(path.join(modDir, 'SKILL.md'), '# Module')
  if (extras?.claudeMd) fs.writeFileSync(path.join(modDir, 'CLAUDE.base.md'), '# Module')
  return modDir
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-mcp-test-'))
  fs.mkdirSync(path.join(tmpDir, '.datacore', 'modules'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('datacore.modules.health', () => {
  it('returns error for nonexistent module', async () => {
    const result = await handleModulesHealth({ module: 'nope' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.error).toContain('not found')
  })

  it('reports ok for a fully compliant module', async () => {
    writeModule('gtd', { manifest_version: 2, name: 'gtd' }, { skillMd: true, claudeMd: true })

    const result = await handleModulesHealth({ module: 'gtd' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.status).toBe('ok')
    expect(result.issues).toEqual([])
  })

  it('warns about missing SKILL.md and CLAUDE.base.md', async () => {
    writeModule('bare', { name: 'bare' })

    const result = await handleModulesHealth({ module: 'bare' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect(result.status).toBe('warning')
    expect(result.issues).toContain('Missing SKILL.md (ecosystem entry point)')
    expect(result.issues).toContain('Missing CLAUDE.base.md (AI context)')
  })

  it('warns about v1 manifest', async () => {
    writeModule('old', { name: 'old' }, { skillMd: true, claudeMd: true })

    const result = await handleModulesHealth({ module: 'old' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect((result.issues as string[]).some(i => i.includes('v1 format'))).toBe(true)
  })

  it('warns about data files in module code dir', async () => {
    const modDir = writeModule('leaky', { manifest_version: 2, name: 'leaky' }, { skillMd: true, claudeMd: true })
    fs.mkdirSync(path.join(modDir, 'output'))
    fs.writeFileSync(path.join(modDir, 'cache.json'), '{}')

    const result = await handleModulesHealth({ module: 'leaky' }, makeStorage(tmpDir)) as Record<string, unknown>
    expect((result.issues as string[]).some(i => i.includes("'output/'"))).toBe(true)
    expect((result.issues as string[]).some(i => i.includes("'cache.json'"))).toBe(true)
  })

  it('checks all modules when no name provided', async () => {
    writeModule('a', { manifest_version: 2, name: 'a' }, { skillMd: true, claudeMd: true })
    writeModule('b', { name: 'b' })

    const result = await handleModulesHealth({}, makeStorage(tmpDir)) as Record<string, unknown>
    const summary = result.summary as Record<string, number>
    expect(summary.total).toBe(2)
    expect(summary.ok).toBe(1)
    expect(summary.warnings).toBe(1)
  })
})
