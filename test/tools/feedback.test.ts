// test/tools/feedback.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleFeedback } from '../../src/tools/feedback.js'
import { loadEngrams } from '../../src/engrams.js'

describe('datacore.feedback', () => {
  const tmpDir = path.join(os.tmpdir(), 'feedback-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(engramsPath, `engrams:
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
`)
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('increments positive feedback signal', async () => {
    const result = await handleFeedback(
      { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
      engramsPath,
    )
    expect(result.success).toBe(true)
    expect(result.feedback_signals?.positive).toBe(1)
  })

  it('increments negative feedback signal', async () => {
    const result = await handleFeedback(
      { engram_id: 'ENG-2026-0219-001', signal: 'negative' },
      engramsPath,
    )
    expect(result.success).toBe(true)
    expect(result.feedback_signals?.negative).toBe(1)
  })

  it('returns error for missing engram ID', async () => {
    const result = await handleFeedback(
      { engram_id: 'ENG-NONEXISTENT', signal: 'positive' },
      engramsPath,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('persists feedback to disk via atomic write', async () => {
    await handleFeedback(
      { engram_id: 'ENG-2026-0219-001', signal: 'positive' },
      engramsPath,
    )
    const engrams = loadEngrams(engramsPath)
    expect(engrams[0].feedback_signals?.positive).toBe(1)
  })

  it('updates last_accessed to today', async () => {
    await handleFeedback(
      { engram_id: 'ENG-2026-0219-001', signal: 'neutral' },
      engramsPath,
    )
    const engrams = loadEngrams(engramsPath)
    const today = new Date().toISOString().split('T')[0]
    expect(engrams[0].activation.last_accessed).toBe(today)
  })
})
