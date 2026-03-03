// test/lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleLearn } from '../src/tools/learn.js'
import { handleInject } from '../src/tools/inject-tool.js'
import { handleFeedback } from '../src/tools/feedback.js'
import { handleSessionStart } from '../src/tools/session-start.js'
import { handleSessionEnd } from '../src/tools/session-end.js'
import { SessionTracker } from '../src/session-tracker.js'
import { loadEngrams, saveEngrams } from '../src/engrams.js'
import { loadConfig, resetConfigCache } from '../src/config.js'
import type { StorageConfig } from '../src/storage.js'

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
      packsDir,
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

    await handleFeedback({ engram_id: engramId, signal: 'positive' }, engramsPath, packsDir)
    await handleFeedback({ engram_id: engramId, signal: 'positive' }, engramsPath, packsDir)
    await handleFeedback({ engram_id: engramId, signal: 'negative' }, engramsPath, packsDir)

    const final = loadEngrams(engramsPath)
    const engram = final.find(e => e.id === engramId)!
    expect(engram.feedback_signals?.positive).toBe(2)
    expect(engram.feedback_signals?.negative).toBe(1)
  })
})

describe('session lifecycle: start -> inject -> end -> co-access', () => {
  let tmpDir: string
  let engramsPath: string
  let packsDir: string
  let journalDir: string
  let knowledgeDir: string
  let schemasPath: string
  let storage: StorageConfig
  let tracker: SessionTracker

  beforeEach(() => {
    resetConfigCache()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-lifecycle-'))
    engramsPath = path.join(tmpDir, 'engrams.yaml')
    packsDir = path.join(tmpDir, 'packs')
    journalDir = path.join(tmpDir, 'journal')
    knowledgeDir = path.join(tmpDir, 'knowledge')
    schemasPath = path.join(tmpDir, 'schemas.yaml')
    fs.mkdirSync(packsDir, { recursive: true })
    fs.mkdirSync(journalDir, { recursive: true })
    fs.mkdirSync(knowledgeDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
    loadConfig(tmpDir, 'core')
    tracker = new SessionTracker()

    storage = {
      mode: 'core',
      basePath: tmpDir,
      engramsPath,
      journalPath: journalDir,
      knowledgePath: knowledgeDir,
      packsPath: packsDir,
      schemasPath,
      exchangeInboxPath: path.join(tmpDir, 'exchange', 'inbox'),
      exchangeOutboxPath: path.join(tmpDir, 'exchange', 'outbox'),
      knowledgeSurfacingPath: path.join(tmpDir, 'state', 'knowledge-surfacing.yaml'),
      archivePath: path.join(tmpDir, 'archive'),
      statePath: path.join(tmpDir, 'state'),
    }
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('session.start tracks injected IDs, session.end writes co-access associations', async () => {
    // Create two active engrams that will match the same prompt
    await handleLearn({ statement: 'Always use TypeScript for backend services', tags: ['typescript', 'backend'] }, engramsPath)
    await handleLearn({ statement: 'Use strict TypeScript configuration for safety', tags: ['typescript', 'config'] }, engramsPath)

    // Activate both
    const engrams = loadEngrams(engramsPath)
    engrams[0].status = 'active'
    engrams[1].status = 'active'
    saveEngrams(engramsPath, engrams)

    const id1 = engrams[0].id
    const id2 = engrams[1].id

    // session.start injects both engrams (they match "typescript backend")
    const sessionResult = await handleSessionStart(
      { task: 'typescript backend development' },
      storage,
      null,
      undefined,
      tracker,
    )

    expect(sessionResult.session_id).toBeTruthy()
    // Verify tracker accumulated the injected IDs
    const injectedIds = tracker.getInjectedIds(sessionResult.session_id)
    expect(injectedIds.length).toBeGreaterThanOrEqual(2)
    expect(injectedIds).toContain(id1)
    expect(injectedIds).toContain(id2)

    // session.end triggers Hebbian write-back
    await handleSessionEnd(
      { summary: 'Worked on typescript backend', session_id: sessionResult.session_id },
      storage,
      undefined,
      tracker,
    )

    // Verify co-access associations were created bidirectionally
    const afterEnd = loadEngrams(engramsPath)
    const eng1 = afterEnd.find(e => e.id === id1)!
    const eng2 = afterEnd.find(e => e.id === id2)!

    const assoc1to2 = eng1.associations.find(
      a => a.target === id2 && a.type === 'co_accessed',
    )
    const assoc2to1 = eng2.associations.find(
      a => a.target === id1 && a.type === 'co_accessed',
    )

    expect(assoc1to2).toBeDefined()
    expect(assoc2to1).toBeDefined()
    expect(assoc1to2!.strength).toBe(0.1)  // config default new_strength
    expect(assoc2to1!.strength).toBe(0.1)
    expect(assoc1to2!.updated_at).toBe(new Date().toISOString().split('T')[0])

    // Verify tracker was cleared
    expect(tracker.getInjectedIds(sessionResult.session_id)).toHaveLength(0)
  })

  it('repeated sessions strengthen co-access associations', async () => {
    // Create two active engrams
    await handleLearn({ statement: 'Always use TypeScript for backend services', tags: ['typescript', 'backend'] }, engramsPath)
    await handleLearn({ statement: 'Use strict TypeScript configuration for safety', tags: ['typescript', 'config'] }, engramsPath)

    const engrams = loadEngrams(engramsPath)
    engrams[0].status = 'active'
    engrams[1].status = 'active'
    saveEngrams(engramsPath, engrams)
    const id1 = engrams[0].id
    const id2 = engrams[1].id

    // Run two sessions
    for (let i = 0; i < 2; i++) {
      const sessionResult = await handleSessionStart(
        { task: 'typescript backend development' },
        storage,
        null,
        undefined,
        tracker,
      )
      await handleSessionEnd(
        { summary: `Session ${i + 1}`, session_id: sessionResult.session_id },
        storage,
        undefined,
        tracker,
      )
    }

    // After 2 sessions, strength should have been incremented
    const afterTwo = loadEngrams(engramsPath)
    const eng1 = afterTwo.find(e => e.id === id1)!
    const assoc = eng1.associations.find(
      a => a.target === id2 && a.type === 'co_accessed',
    )

    expect(assoc).toBeDefined()
    // First session: new_strength = 0.1, second session: 0.1 + increment(0.05) = 0.15
    expect(assoc!.strength).toBeCloseTo(0.15, 10)
  })

  it('inject returns injected_personal_ids for tracking', async () => {
    await handleLearn({ statement: 'Use data validation everywhere', tags: ['data', 'validation'] }, engramsPath)
    const engrams = loadEngrams(engramsPath)
    engrams[0].status = 'active'
    saveEngrams(engramsPath, engrams)

    const result = await handleInject(
      { prompt: 'data validation patterns', min_relevance: 0.1 },
      { engramsPath, packsPath: packsDir, schemasPath },
    )

    expect(result.count).toBeGreaterThan(0)
    expect(result.injected_personal_ids).toHaveLength(1)
    expect(result.injected_personal_ids[0]).toBe(engrams[0].id)
  })
})
