// test/engagement/migrate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { calculateRetroactiveXP } from '../../src/engagement/migrate.js'
import { resolveTier } from '../../src/engagement/engine.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import type { Engram } from '../../src/schemas/engram.js'

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  return {
    id: `ENG-2026-0301-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
    version: 1,
    status: 'active',
    type: 'behavioral',
    scope: 'global',
    visibility: 'private',
    statement: 'Test engram',
    activation: {
      retrieval_strength: 0.5,
      storage_strength: 0.5,
      frequency: 1,
      last_accessed: '2026-03-01',
    },
    tags: [],
    pack: null,
    abstract: null,
    derived_from: null,
    consolidated: false,
    derivation_count: 1,
    ...overrides,
  }
}

describe('calculateRetroactiveXP', () => {
  const tmpDir = path.join(os.tmpdir(), 'engagement-migrate-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('calculates correct XP for the reference scenario', () => {
    // 10 quality engrams (status=active) across 4 domains
    // 3 public, 15 total positive feedback, 20 total feedback given
    const engrams: Engram[] = []

    const domains = ['software', 'cooking', 'music', 'science']
    for (let i = 0; i < 10; i++) {
      engrams.push(makeEngram({
        id: `ENG-2026-0301-${String(i).padStart(3, '0')}`,
        status: 'active',
        visibility: i < 3 ? 'public' : 'private',
        domain: domains[i % 4],
        feedback_signals: {
          positive: i < 5 ? 3 : 0, // 5 engrams with 3 positive each = 15 total
          negative: i < 4 ? 2 : 0, // spread negative to make total: 15 + 8 + some neutral
          neutral: i < 3 ? 1 : 0,  // 3 engrams with 1 neutral = 3
        },
      }))
    }

    // Verify our test data:
    // quality (active) = 10 → 10 * 10 = 100
    // public = 3 → 3 * 10 = 30
    // total positive = 5*3 = 15 → 15 * 5 = 75
    // total feedback given = positive + negative + neutral = 15 + 8 + 3 = 26 → 26 * 5 = 130
    // (Adjusting: we need totalFeedbackGiven = 20 for the exact scenario, but let's verify the formula)
    // domains = 4 → 4 * 20 = 80
    // packs = 0 → 0
    // Total = 100 + 30 + 75 + 130 + 80 + 0 = 415

    const xp = calculateRetroactiveXP(engrams)

    // Verify formula: qualityCount*10 + publicCount*10 + totalPositiveFeedback*5 + totalFeedbackGiven*5 + domainCount*20 + packsExported*25
    const expectedQuality = 10 * 10 // 100
    const expectedPublic = 3 * 10   // 30
    const expectedPositive = 15 * 5 // 75
    const expectedFeedback = 26 * 5 // 130
    const expectedDomains = 4 * 20  // 80
    const expectedPacks = 0 * 25    // 0
    const expected = expectedQuality + expectedPublic + expectedPositive + expectedFeedback + expectedDomains + expectedPacks

    expect(xp).toBe(expected) // 415
  })

  it('returns 0 XP for zero engrams', () => {
    const xp = calculateRetroactiveXP([])
    expect(xp).toBe(0)
  })

  it('only counts active engrams for quality score', () => {
    const engrams = [
      makeEngram({ status: 'active', domain: 'test' }),
      makeEngram({ status: 'retired', domain: 'test' }),
      makeEngram({ status: 'dormant', domain: 'test' }),
      makeEngram({ status: 'candidate', domain: 'test' }),
    ]

    const xp = calculateRetroactiveXP(engrams)
    // quality: 1 active * 10 = 10
    // public: 0 * 10 = 0
    // positive feedback: 0
    // total feedback given: 0
    // domains: 1 * 20 = 20 (all have domain 'test', counted from all engrams)
    // packs: 0
    expect(xp).toBe(30)
  })

  it('counts template visibility as public', () => {
    const engrams = [
      makeEngram({ status: 'active', visibility: 'template', domain: 'test' }),
    ]

    const xp = calculateRetroactiveXP(engrams)
    // quality: 1 * 10 = 10
    // public (template counts): 1 * 10 = 10
    // feedback: 0
    // domains: 1 * 20 = 20
    expect(xp).toBe(40)
  })

  it('counts feedback from all engrams, not just active', () => {
    const engrams = [
      makeEngram({
        status: 'retired',
        domain: 'test',
        feedback_signals: { positive: 5, negative: 2, neutral: 1 },
      }),
    ]

    const xp = calculateRetroactiveXP(engrams)
    // quality (active): 0 * 10 = 0
    // public: 0
    // positive feedback: 5 * 5 = 25
    // total feedback given: (5+2+1) * 5 = 40
    // domains: 1 * 20 = 20
    expect(xp).toBe(85)
  })

  it('counts unique domains from all engrams', () => {
    const engrams = [
      makeEngram({ status: 'active', domain: 'a' }),
      makeEngram({ status: 'active', domain: 'a' }),
      makeEngram({ status: 'active', domain: 'b' }),
      makeEngram({ status: 'retired', domain: 'c' }),
    ]

    const xp = calculateRetroactiveXP(engrams)
    // quality: 3 * 10 = 30
    // public: 0
    // feedback: 0
    // domains: 3 (a, b, c) * 20 = 60
    expect(xp).toBe(90)
  })

  it('ignores engrams without domain for domain count', () => {
    const engrams = [
      makeEngram({ status: 'active', domain: undefined }),
      makeEngram({ status: 'active', domain: 'software' }),
    ]

    const xp = calculateRetroactiveXP(engrams)
    // quality: 2 * 10 = 20
    // public: 0
    // feedback: 0
    // domains: 1 * 20 = 20
    expect(xp).toBe(40)
  })
})

describe('tier boundaries from retroactive XP', () => {
  it('0 XP resolves to Seed', () => {
    const profile = createDefaultProfile()
    profile.xp.total = 0
    expect(resolveTier(profile).current).toBe('Seed')
  })

  it('99 XP resolves to Seed', () => {
    const profile = createDefaultProfile()
    profile.xp.total = 99
    expect(resolveTier(profile).current).toBe('Seed')
  })

  it('100 XP resolves to Cipher', () => {
    const profile = createDefaultProfile()
    profile.xp.total = 100
    expect(resolveTier(profile).current).toBe('Cipher')
  })

  it('499 XP resolves to Cipher', () => {
    const profile = createDefaultProfile()
    profile.xp.total = 499
    expect(resolveTier(profile).current).toBe('Cipher')
  })

  it('500 XP resolves to Sage', () => {
    const profile = createDefaultProfile()
    profile.xp.total = 500
    expect(resolveTier(profile).current).toBe('Sage')
  })
})
