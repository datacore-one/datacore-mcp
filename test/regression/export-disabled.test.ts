// test/regression/export-disabled.test.ts
// Verify handleExport response is unchanged when engagement is disabled.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/index.js'
import { handleExport } from '../../src/tools/export.js'

describe('regression: export with engagement disabled', () => {
  const tmpDir = path.join(os.tmpdir(), 'reg-export-disabled-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const packsPath = path.join(tmpDir, 'packs')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(packsPath, { recursive: true })
    fs.writeFileSync(engramsPath, yaml.dump({
      engrams: [{
        id: 'ENG-2026-0301-001',
        version: 2,
        status: 'active',
        consolidated: false,
        type: 'behavioral',
        scope: 'global',
        visibility: 'public',
        statement: 'Public engram for export test',
        derivation_count: 1,
        tags: [],
        activation: {
          retrieval_strength: 0.7,
          storage_strength: 1.0,
          frequency: 0,
          last_accessed: '2026-03-01',
        },
        pack: null,
        abstract: null,
        derived_from: null,
      }],
    }))
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns pack_path in preview mode with no engagement interference', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handleExport(
      { name: 'test-pack', description: 'Test export', confirm: false },
      { engramsPath, packsPath },
      service,
    )

    expect(result.success).toBe(true)
    expect(result.preview).toBeDefined()
    expect(result.preview!.count).toBe(1)
    expect(result.preview!.pack_path).toContain('test-pack')
  })

  it('writes pack to disk with no engagement interference', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handleExport(
      { name: 'test-pack', description: 'Test export', confirm: true },
      { engramsPath, packsPath },
      service,
    )

    expect(result.success).toBe(true)
    expect(result.pack_path).toBeDefined()
    expect(fs.existsSync(result.pack_path!)).toBe(true)
  })
})
