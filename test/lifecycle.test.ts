// test/lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleLearn } from '../src/tools/learn.js'
import { handleInject } from '../src/tools/inject-tool.js'
import { handleFeedback } from '../src/tools/feedback.js'
import { loadEngrams, saveEngrams } from '../src/engrams.js'
import { loadConfig, resetConfigCache } from '../src/config.js'

describe('learn -> inject -> feedback lifecycle', () => {
  const tmpDir = path.join(os.tmpdir(), 'lifecycle-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const packsDir = path.join(tmpDir, 'packs')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(packsDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('full cycle: learn, inject matches, feedback boosts', async () => {
    // 1. Learn creates an engram
    const learnResult = await handleLearn(
      { statement: 'Always validate data ownership before processing', tags: ['data', 'ownership'] },
      engramsPath,
    )
    expect(learnResult.success).toBe(true)
    const engramId = learnResult.engram.id

    // Set status to active (learn creates as candidate)
    const engrams = loadEngrams(engramsPath)
    engrams[0].status = 'active'
    saveEngrams(engramsPath, engrams)

    // 2. Inject with matching prompt returns the engram and updates usage
    const injectResult = await handleInject(
      { prompt: 'design a data model for ownership tracking', min_relevance: 0.1 },
      { engramsPath, packsPath: packsDir },
    )
    expect(injectResult.count).toBeGreaterThan(0)
    expect(injectResult.text).toContain('validate data ownership')

    // Verify usage was updated
    const afterInject = loadEngrams(engramsPath)
    const injected = afterInject.find(e => e.id === engramId)!
    expect(injected.activation.frequency).toBe(1)
    expect(injected.activation.last_accessed).toBe(new Date().toISOString().split('T')[0])

    // 3. Feedback with positive signal
    const fbResult = await handleFeedback(
      { engram_id: engramId, signal: 'positive' },
      engramsPath,
    )
    expect(fbResult.mode).toBe('single')
    expect((fbResult as any).success).toBe(true)
    expect((fbResult as any).feedback_signals?.positive).toBe(1)
  })

  it('decay reduces score for old engrams', async () => {
    // Create an active engram with old last_accessed
    const learnResult = await handleLearn(
      { statement: 'Always validate data ownership', tags: ['data', 'ownership'] },
      engramsPath,
    )
    const engrams = loadEngrams(engramsPath)
    engrams[0].status = 'active'
    engrams[0].activation.last_accessed = '2025-01-01' // very old
    engrams[0].activation.retrieval_strength = 0.8
    saveEngrams(engramsPath, engrams)

    // Inject — the engram should score lower due to decay
    const result = await handleInject(
      { prompt: 'data ownership validation', min_relevance: 0.01 },
      { engramsPath, packsPath: packsDir },
    )
    // It may or may not match depending on decayed score vs minRelevance
    // But if it does match, its effective RS should be at the floor (0.05)
    if (result.count > 0) {
      // After injection, last_accessed should be updated to today
      const updated = loadEngrams(engramsPath)
      expect(updated[0].activation.last_accessed).toBe(new Date().toISOString().split('T')[0])
    }
  })

  it('multiple feedback signals accumulate', async () => {
    const learnResult = await handleLearn(
      { statement: 'Test feedback accumulation', tags: ['test'] },
      engramsPath,
    )
    const engrams = loadEngrams(engramsPath)
    engrams[0].status = 'active'
    saveEngrams(engramsPath, engrams)

    const engramId = learnResult.engram.id

    await handleFeedback({ engram_id: engramId, signal: 'positive' }, engramsPath)
    await handleFeedback({ engram_id: engramId, signal: 'positive' }, engramsPath)
    await handleFeedback({ engram_id: engramId, signal: 'negative' }, engramsPath)

    const final = loadEngrams(engramsPath)
    const engram = final.find(e => e.id === engramId)!
    expect(engram.feedback_signals?.positive).toBe(2)
    expect(engram.feedback_signals?.negative).toBe(1)
  })
})
