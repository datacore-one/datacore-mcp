// test/engagement/engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { resolveTier, awardXP, isActionEligible } from '../../src/engagement/engine.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import { BUNDLED_ACTIONS } from '../../src/engagement/actions.js'
import type { EngagementProfile } from '../../src/engagement/types.js'

describe('engagement/engine', () => {
  const tmpDir = path.join(os.tmpdir(), 'engagement-engine-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('resolveTier', () => {
    it('resolves 0 XP to Seed', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 0
      const result = resolveTier(profile)
      expect(result.current).toBe('Seed')
      expect(result.changed).toBe(false)
    })

    it('resolves exactly 100 XP to Cipher', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 100
      const result = resolveTier(profile)
      expect(result.current).toBe('Cipher')
      expect(result.changed).toBe(true)
      expect(result.message).toContain('Cipher')
    })

    it('resolves exactly 500 XP to Sage', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 500
      const result = resolveTier(profile)
      expect(result.current).toBe('Sage')
      expect(result.changed).toBe(true)
    })

    it('resolves exactly 1200 XP to Adept', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 1200
      const result = resolveTier(profile)
      expect(result.current).toBe('Adept')
      expect(result.changed).toBe(true)
    })

    it('resolves exactly 2500 XP to Visionary', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 2500
      const result = resolveTier(profile)
      expect(result.current).toBe('Visionary')
      expect(result.changed).toBe(true)
    })

    it('resolves exactly 5000 XP to Oracle', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 5000
      const result = resolveTier(profile)
      expect(result.current).toBe('Oracle')
      expect(result.changed).toBe(true)
    })

    it('resolves 99 XP to Seed (just below Cipher threshold)', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 99
      expect(resolveTier(profile).current).toBe('Seed')
    })

    it('resolves 499 XP to Cipher (just below Sage threshold)', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 499
      expect(resolveTier(profile).current).toBe('Cipher')
    })

    it('resolves 1199 XP to Sage (just below Adept threshold)', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 1199
      expect(resolveTier(profile).current).toBe('Sage')
    })

    it('resolves 2499 XP to Adept (just below Visionary threshold)', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 2499
      expect(resolveTier(profile).current).toBe('Adept')
    })

    it('resolves 4999 XP to Visionary (just below Oracle threshold)', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 4999
      expect(resolveTier(profile).current).toBe('Visionary')
    })

    it('resolves 10000 XP to Oracle (well above max threshold)', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 10000
      expect(resolveTier(profile).current).toBe('Oracle')
    })

    it('reports no change when tier matches current', () => {
      const profile = createDefaultProfile()
      profile.xp.total = 150
      profile.tier.current = 'Cipher'
      const result = resolveTier(profile)
      expect(result.current).toBe('Cipher')
      expect(result.changed).toBe(false)
      expect(result.message).toBeUndefined()
    })
  })

  describe('awardXP', () => {
    it('returns null for ineligible action', () => {
      const profile = createDefaultProfile()
      const result = awardXP(profile, 'nonexistent_action', BUNDLED_ACTIONS)
      expect(result).toBeNull()
    })

    it('awards correct base XP with multiplier 1.0', () => {
      const profile = createDefaultProfile()
      const result = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result).not.toBeNull()
      expect(result!.event.xp_base).toBe(10)
      expect(result!.event.multiplier).toBe(1.0)
      expect(result!.event.xp_earned).toBe(10)
      expect(result!.event.action_key).toBe('engram_created')
      expect(result!.profile.xp.total).toBe(10)
    })

    it('applies multiplier to XP calculation', () => {
      const profile = createDefaultProfile()
      profile.multipliers.active = [{ type: 'verified', factor: 1.5, since: '2026-03-01' }]

      const result = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result).not.toBeNull()
      expect(result!.event.xp_base).toBe(10)
      expect(result!.event.multiplier).toBe(1.5)
      expect(result!.event.xp_earned).toBe(15) // Math.round(10 * 1.5)
      expect(result!.profile.xp.total).toBe(15)
    })

    it('stacks multiple multipliers', () => {
      const profile = createDefaultProfile()
      profile.multipliers.active = [
        { type: 'verified', factor: 1.5, since: '2026-03-01' },
        { type: 'top_teacher', factor: 1.25, since: '2026-03-01' },
      ]

      const result = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result).not.toBeNull()
      // 1.5 * 1.25 = 1.875
      expect(result!.event.multiplier).toBeCloseTo(1.875)
      expect(result!.event.xp_earned).toBe(Math.round(10 * 1.875)) // 19
    })

    it('does not mutate input profile (immutability)', () => {
      const profile = createDefaultProfile()
      const originalTotal = profile.xp.total
      const originalHistory = [...profile.xp.history]

      awardXP(profile, 'engram_created', BUNDLED_ACTIONS)

      // Input profile must remain unchanged
      expect(profile.xp.total).toBe(originalTotal)
      expect(profile.xp.history).toEqual(originalHistory)
    })

    it('accumulates XP across multiple awards', () => {
      let profile = createDefaultProfile()

      const result1 = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result1).not.toBeNull()
      profile = result1!.profile

      const result2 = awardXP(profile, 'feedback_given', BUNDLED_ACTIONS)
      expect(result2).not.toBeNull()
      expect(result2!.profile.xp.total).toBe(15) // 10 + 5
    })

    it('adds action to history entry for today', () => {
      const profile = createDefaultProfile()
      const result = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result).not.toBeNull()
      const today = new Date().toISOString().split('T')[0]
      const todayEntry = result!.profile.xp.history.find(h => h.date === today)
      expect(todayEntry).toBeDefined()
      expect(todayEntry!.actions).toContain('engram_created')
      expect(todayEntry!.earned).toBe(10)
    })

    it('increments stat counters for engram_created', () => {
      const profile = createDefaultProfile()
      const result = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result!.profile.stats.total_engrams_created).toBe(1)
    })

    it('increments stat counters for feedback_given', () => {
      const profile = createDefaultProfile()
      const result = awardXP(profile, 'feedback_given', BUNDLED_ACTIONS)
      expect(result!.profile.stats.total_feedback_given).toBe(1)
    })

    it('increments stat counters for engram_retired', () => {
      const profile = createDefaultProfile()
      const result = awardXP(profile, 'engram_retired', BUNDLED_ACTIONS, { engram_age_days: 30 })
      expect(result!.profile.stats.total_engrams_retired).toBe(1)
    })

    it('sets first_activity on first award', () => {
      const profile = createDefaultProfile()
      expect(profile.stats.first_activity).toBeNull()

      const result = awardXP(profile, 'engram_created', BUNDLED_ACTIONS)
      const today = new Date().toISOString().split('T')[0]
      expect(result!.profile.stats.first_activity).toBe(today)
    })

    it('passes context through to event', () => {
      const profile = createDefaultProfile()
      const ctx = { engram_id: 'ENG-001', signal: 'positive' }
      const result = awardXP(profile, 'feedback_given', BUNDLED_ACTIONS, ctx)
      expect(result!.event.context).toEqual(ctx)
    })
  })

  describe('isActionEligible', () => {
    it('returns eligible for known action with no limits', () => {
      const profile = createDefaultProfile()
      const result = isActionEligible(profile, 'engram_created', BUNDLED_ACTIONS)
      expect(result.eligible).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('returns ineligible for unknown action', () => {
      const profile = createDefaultProfile()
      const result = isActionEligible(profile, 'nonexistent', BUNDLED_ACTIONS)
      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('Unknown action')
    })

    it('enforces daily limit', () => {
      const profile = createDefaultProfile()
      const today = new Date().toISOString().split('T')[0]

      // Simulate 10 feedback actions today (daily_limit = 10)
      profile.xp.history.push({
        date: today,
        earned: 50,
        base_earned: 50,
        multiplier: 1.0,
        actions: Array(10).fill('feedback_given'),
      })

      const result = isActionEligible(profile, 'feedback_given', BUNDLED_ACTIONS)
      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('Daily limit')
    })

    it('allows action below daily limit', () => {
      const profile = createDefaultProfile()
      const today = new Date().toISOString().split('T')[0]

      // 9 feedback actions today — still below limit of 10
      profile.xp.history.push({
        date: today,
        earned: 45,
        base_earned: 45,
        multiplier: 1.0,
        actions: Array(9).fill('feedback_given'),
      })

      const result = isActionEligible(profile, 'feedback_given', BUNDLED_ACTIONS)
      expect(result.eligible).toBe(true)
    })

    it('enforces cooldown based on engram age', () => {
      const profile = createDefaultProfile()
      // engram_retired has cooldown_days: 7
      const result = isActionEligible(
        profile,
        'engram_retired',
        BUNDLED_ACTIONS,
        { engram_age_days: 3 }, // less than 7
      )
      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('Cooldown')
    })

    it('allows action when cooldown is satisfied', () => {
      const profile = createDefaultProfile()
      const result = isActionEligible(
        profile,
        'engram_retired',
        BUNDLED_ACTIONS,
        { engram_age_days: 7 },
      )
      expect(result.eligible).toBe(true)
    })

    it('allows action when cooldown_days exists but no engram_age_days in context', () => {
      const profile = createDefaultProfile()
      // engram_retired has cooldown_days: 7 but no context provided
      const result = isActionEligible(profile, 'engram_retired', BUNDLED_ACTIONS)
      expect(result.eligible).toBe(true)
    })

    it('daily limit only counts matching action key', () => {
      const profile = createDefaultProfile()
      const today = new Date().toISOString().split('T')[0]

      // 10 engram_created actions today — should NOT affect feedback_given limit
      profile.xp.history.push({
        date: today,
        earned: 100,
        base_earned: 100,
        multiplier: 1.0,
        actions: Array(10).fill('engram_created'),
      })

      const result = isActionEligible(profile, 'feedback_given', BUNDLED_ACTIONS)
      expect(result.eligible).toBe(true)
    })
  })
})
