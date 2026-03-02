// test/regression/feedback-disabled.test.ts
// Verify handleFeedback response is unchanged when engagement is disabled.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/index.js'
import { handleFeedback } from '../../src/tools/feedback.js'

describe('regression: feedback with engagement disabled', () => {
  const tmpDir = path.join(os.tmpdir(), 'reg-feedback-disabled-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(path.join(tmpDir, 'packs'), { recursive: true })
    fs.writeFileSync(engramsPath, yaml.dump({
      engrams: [{
        id: 'ENG-2026-0301-001',
        version: 2,
        status: 'active',
        consolidated: false,
        type: 'behavioral',
        scope: 'global',
        visibility: 'private',
        statement: 'Test engram for feedback',
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

  it('returns same response structure when engagement disabled', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handleFeedback(
      { engram_id: 'ENG-2026-0301-001', signal: 'positive' },
      engramsPath,
      path.join(tmpDir, 'packs'),
      service,
    )

    expect(result.mode).toBe('single')
    if (result.mode === 'single') {
      expect(result.success).toBe(true)
      expect(result.engram_id).toBe('ENG-2026-0301-001')
      expect(result.signal).toBe('positive')
      expect(result.feedback_signals).toBeDefined()
      expect(result.feedback_signals!.positive).toBe(1)
    }
  })
})
