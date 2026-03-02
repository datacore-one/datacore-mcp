// test/regression/promote-disabled.test.ts
// Verify handlePromote response is unchanged when engagement is disabled.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/index.js'
import { handlePromote } from '../../src/tools/promote.js'

describe('regression: promote with engagement disabled', () => {
  const tmpDir = path.join(os.tmpdir(), 'reg-promote-disabled-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(engramsPath, yaml.dump({
      engrams: [{
        id: 'ENG-2026-0301-001',
        version: 2,
        status: 'candidate',
        consolidated: false,
        type: 'behavioral',
        scope: 'global',
        visibility: 'private',
        statement: 'Test engram for promote',
        derivation_count: 1,
        tags: [],
        activation: {
          retrieval_strength: 0.5,
          storage_strength: 0.3,
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

  it('returns same response structure when engagement disabled', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handlePromote(
      { id: 'ENG-2026-0301-001' },
      engramsPath,
      service,
    )

    expect(result.success).toBe(true)
    expect(result.promoted).toHaveLength(1)
    expect(result.promoted[0].id).toBe('ENG-2026-0301-001')
    expect(result.promoted[0].statement).toBe('Test engram for promote')
    expect(result.errors).toHaveLength(0)
  })
})
