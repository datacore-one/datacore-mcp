// test/tools/feedback.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleFeedback } from '../../src/tools/feedback.js'
import { loadEngrams } from '../../src/engrams.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

const ENGRAM_YAML = `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    visibility: private
    statement: "Always validate input"
    tags: [validation]
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-02-19"
  - id: ENG-2026-0219-002
    version: 2
    status: active
    type: behavioral
    scope: global
    visibility: private
    statement: "Use atomic writes"
    tags: [io]
    activation:
      retrieval_strength: 0.7
      storage_strength: 0.5
      frequency: 1
      last_accessed: "2026-02-19"
`

describe('datacore.feedback', () => {
  const tmpDir = path.join(os.tmpdir(), 'feedback-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const packsPath = path.join(tmpDir, 'packs')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(packsPath, { recursive: true })
    fs.writeFileSync(engramsPath, ENGRAM_YAML)
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('single mode', () => {
    it('increments positive feedback signal', async () => {
      const result = await handleFeedback(
        { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
        engramsPath,
        packsPath,
      )
      expect(result.mode).toBe('single')
      expect((result as any).success).toBe(true)
      expect((result as any).feedback_signals?.positive).toBe(1)
    })

    it('increments negative feedback signal', async () => {
      const result = await handleFeedback(
        { engram_id: 'ENG-2026-0219-001', signal: 'negative' },
        engramsPath,
        packsPath,
      )
      expect((result as any).success).toBe(true)
      expect((result as any).feedback_signals?.negative).toBe(1)
    })

    it('returns error for missing engram ID', async () => {
      const result = await handleFeedback(
        { engram_id: 'ENG-NONEXISTENT', signal: 'positive' },
        engramsPath,
        packsPath,
      )
      expect(result.mode).toBe('single')
      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('not found')
    })

    it('persists feedback to disk via atomic write', async () => {
      await handleFeedback(
        { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
        engramsPath,
        packsPath,
      )
      const engrams = loadEngrams(engramsPath)
      expect(engrams[0].feedback_signals?.positive).toBe(1)
    })

    it('updates last_accessed to today', async () => {
      await handleFeedback(
        { engram_id: 'ENG-2026-0219-001', signal: 'neutral' },
        engramsPath,
        packsPath,
      )
      const engrams = loadEngrams(engramsPath)
      const today = new Date().toISOString().split('T')[0]
      expect(engrams[0].activation.last_accessed).toBe(today)
    })

    it('includes error hints for missing engram', async () => {
      const result = await handleFeedback(
        { engram_id: 'ENG-NONEXISTENT', signal: 'positive' },
        engramsPath,
        packsPath,
      )
      expect((result as any)._hints?.next).toContain('Engram not found')
    })
  })

  describe('batch mode', () => {
    it('processes multiple feedback signals', async () => {
      const result = await handleFeedback({
        signals: [
          { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
          { engram_id: 'ENG-2026-0219-002', signal: 'negative' },
        ],
      }, engramsPath, packsPath)

      expect(result.mode).toBe('batch')
      const batch = result as any
      expect(batch.results).toHaveLength(2)
      expect(batch.results[0].success).toBe(true)
      expect(batch.results[1].success).toBe(true)
      expect(batch.summary.positive).toBe(1)
      expect(batch.summary.negative).toBe(1)
    })

    it('handles mixed success and errors in batch', async () => {
      const result = await handleFeedback({
        signals: [
          { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
          { engram_id: 'ENG-NONEXISTENT', signal: 'negative' },
        ],
      }, engramsPath, packsPath)

      const batch = result as any
      expect(batch.results[0].success).toBe(true)
      expect(batch.results[1].success).toBe(false)
      expect(batch.results[1].error).toContain('not found')
    })

    it('persists all batch feedback in single write', async () => {
      await handleFeedback({
        signals: [
          { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
          { engram_id: 'ENG-2026-0219-002', signal: 'positive' },
        ],
      }, engramsPath, packsPath)

      const engrams = loadEngrams(engramsPath)
      expect(engrams[0].feedback_signals?.positive).toBe(1)
      expect(engrams[1].feedback_signals?.positive).toBe(1)
    })

    it('includes hints in batch result', async () => {
      const result = await handleFeedback({
        signals: [{ engram_id: 'ENG-2026-0219-001', signal: 'positive' }],
      }, engramsPath, packsPath)
      expect((result as any)._hints?.next).toContain('Batch feedback recorded')
    })
  })
})
