// test/tools/export.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleExport } from '../../src/tools/export.js'

const makeEngram = (overrides: Record<string, unknown> = {}) => ({
  id: 'ENG-2026-0101-001',
  version: 1,
  statement: 'Always test before deploying',
  type: 'behavioral',
  scope: 'global',
  tags: ['testing', 'deployment'],
  domain: 'software.engineering',
  status: 'active',
  visibility: 'public',
  activation: {
    retrieval_strength: 0.8,
    storage_strength: 1.0,
    frequency: 5,
    last_accessed: '2026-01-15',
  },
  feedback_signals: { positive: 3, negative: 0 },
  ...overrides,
})

describe('datacore.packs.export', () => {
  const tmpDir = path.join(os.tmpdir(), 'export-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const packsPath = path.join(tmpDir, 'packs')

  beforeEach(() => {
    fs.mkdirSync(packsPath, { recursive: true })
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  function writeEngrams(engrams: Record<string, unknown>[]) {
    fs.writeFileSync(engramsPath, yaml.dump({ engrams }, { lineWidth: 120, noRefs: true }))
  }

  it('returns preview without writing when confirm is false', async () => {
    writeEngrams([makeEngram()])
    const result = await handleExport(
      { name: 'Test Pack', description: 'A test pack' },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    expect(result.preview).toBeDefined()
    expect(result.preview!.count).toBe(1)
    expect(result.pack_path).toBeUndefined()
    // Should NOT have written files
    expect(fs.existsSync(path.join(packsPath, 'test-pack'))).toBe(false)
  })

  it('writes pack when confirm is true', async () => {
    writeEngrams([makeEngram()])
    const result = await handleExport(
      { name: 'Test Pack', description: 'A test pack', confirm: true },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    expect(result.pack_path).toBeDefined()
    expect(fs.existsSync(path.join(result.pack_path!, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(result.pack_path!, 'engrams.yaml'))).toBe(true)

    // Verify SKILL.md has schema_version
    const skill = fs.readFileSync(path.join(result.pack_path!, 'SKILL.md'), 'utf8')
    expect(skill).toContain('schema_version: 2')
  })

  it('refuses to export private engrams', async () => {
    writeEngrams([makeEngram({ visibility: 'private', id: 'ENG-2026-0101-001' })])
    const result = await handleExport(
      { name: 'Test Pack', description: 'A test', engram_ids: ['ENG-2026-0101-001'] },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('private')
  })

  it('filters by tags', async () => {
    writeEngrams([
      makeEngram({ id: 'ENG-2026-0101-001', tags: ['testing'] }),
      makeEngram({ id: 'ENG-2026-0101-002', tags: ['deployment'] }),
    ])
    const result = await handleExport(
      { name: 'Test', description: 'Filtered', filter_tags: ['testing'] },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    expect(result.preview!.count).toBe(1)
  })

  it('exported pack is loadable', async () => {
    writeEngrams([makeEngram()])
    const result = await handleExport(
      { name: 'Loadable Pack', description: 'Test', confirm: true },
      { engramsPath, packsPath },
    )
    // Verify the exported engrams.yaml is valid YAML
    const exported = yaml.load(
      fs.readFileSync(path.join(result.pack_path!, 'engrams.yaml'), 'utf8'),
    ) as { engrams: unknown[] }
    expect(exported.engrams).toHaveLength(1)
  })

  it('errors when pack directory already exists', async () => {
    writeEngrams([makeEngram()])
    // Create the pack dir first
    const packDir = path.join(packsPath, 'test-pack')
    fs.mkdirSync(packDir, { recursive: true })
    fs.writeFileSync(path.join(packDir, 'SKILL.md'), 'existing')

    const result = await handleExport(
      { name: 'Test Pack', description: 'A test', confirm: true },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  it('preserves contraindications in exported engrams', async () => {
    writeEngrams([makeEngram({
      contraindications: ['Not for production databases', 'Skip for hotfixes'],
    })])
    const result = await handleExport(
      { name: 'Contra Pack', description: 'Test', confirm: true },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    const exported = yaml.load(
      fs.readFileSync(path.join(result.pack_path!, 'engrams.yaml'), 'utf8'),
    ) as { engrams: Array<{ contraindications?: string[] }> }
    expect(exported.engrams[0].contraindications).toEqual([
      'Not for production databases',
      'Skip for hotfixes',
    ])
  })
})
