import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { resetPlur } from '../plur-bridge.js'

// Mock config for hints
vi.mock('../config.js', () => ({
  getConfig: () => ({
    version: 2,
    engrams: { auto_promote: true },
    packs: { trusted_publishers: [] },
    search: { max_results: 20, snippet_length: 500 },
    hints: { enabled: true },
    engagement: { enabled: false, inline_xp: false },
    injection: { directive_cap: 10, consider_cap: 5, spread_cap: 3, spread_budget: 480 },
  }),
}))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plur-feedback-'))
  process.env.PLUR_PATH = tmpDir
  resetPlur()
})

afterEach(() => {
  delete process.env.PLUR_PATH
  resetPlur()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('handleFeedback', () => {
  it('single mode works for existing engram', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Feedback test engram')

    const { handleFeedback } = await import('../tools/feedback.js')
    const result = await handleFeedback({ engram_id: engram.id, signal: 'positive' })
    expect(result.mode).toBe('single')
    expect((result as any).success).toBe(true)
    expect((result as any).engram_id).toBe(engram.id)
    expect((result as any).signal).toBe('positive')
  })

  it('single mode returns error for non-existent ID', async () => {
    const { handleFeedback } = await import('../tools/feedback.js')
    const result = await handleFeedback({ engram_id: 'ENG-0000-0000-999', signal: 'positive' })
    expect(result.mode).toBe('single')
    expect((result as any).success).toBe(false)
    expect((result as any).error).toBeDefined()
  })

  it('batch mode works', async () => {
    const plur = new Plur({ path: tmpDir })
    const e1 = plur.learn('Batch engram one')
    const e2 = plur.learn('Batch engram two')

    const { handleFeedback } = await import('../tools/feedback.js')
    const result = await handleFeedback({
      signals: [
        { engram_id: e1.id, signal: 'positive' },
        { engram_id: e2.id, signal: 'negative' },
      ],
    })
    expect(result.mode).toBe('batch')
    const batch = result as any
    expect(batch.results).toHaveLength(2)
    expect(batch.summary.positive).toBe(1)
    expect(batch.summary.negative).toBe(1)
    expect(batch.summary.neutral).toBe(0)
  })

  it('batch mode handles mix of valid and invalid IDs', async () => {
    const plur = new Plur({ path: tmpDir })
    const e1 = plur.learn('Valid engram')

    const { handleFeedback } = await import('../tools/feedback.js')
    const result = await handleFeedback({
      signals: [
        { engram_id: e1.id, signal: 'positive' },
        { engram_id: 'ENG-0000-0000-999', signal: 'negative' },
      ],
    })
    expect(result.mode).toBe('batch')
    const batch = result as any
    expect(batch.results[0].success).toBe(true)
    expect(batch.results[1].success).toBe(false)
    expect(batch.results[1].error).toBeDefined()
  })
})
