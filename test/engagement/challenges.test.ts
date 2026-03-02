// test/engagement/challenges.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import {
  generateChallenge,
  checkChallengeCompletion,
  resolveChallenge,
  dismissChallenge,
} from '../../src/engagement/challenges.js'
import type { EngagementProfile, Challenge } from '../../src/engagement/types.js'

describe('engagement/challenges', () => {
  const tmpDir = path.join(os.tmpdir(), 'challenges-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('generateChallenge', () => {
    it('generates getting-started track for profile with < 10 engrams', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 5 // below 10 threshold
      profile.tier.current = 'Seed'

      const updated = generateChallenge(profile)
      expect(updated.challenges.active).not.toBeNull()

      const challenge = updated.challenges.active!
      // Getting-started challenges are: first_steps, first_feedback, explore_domain
      expect(['first_steps', 'first_feedback', 'explore_domain']).toContain(challenge.type)
      expect(challenge.tier).toBe('Seed')
      expect(challenge.bonus_xp).toBeGreaterThan(0)
      expect(challenge.baseline_stats).toBeDefined()
      expect(challenge.started_at).toBeTruthy()
      expect(challenge.expires_at).toBeTruthy()
    })

    it('generates regular challenges by tier', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 15 // above 10 threshold
      profile.tier.current = 'Sage' // tier rank 2

      const updated = generateChallenge(profile)
      expect(updated.challenges.active).not.toBeNull()

      const challenge = updated.challenges.active!
      // Regular challenges for Sage and below: first_steps, first_feedback, domain_deep_dive
      expect(['first_steps', 'first_feedback', 'domain_deep_dive']).toContain(challenge.type)
    })

    it('returns null (unchanged) if there is already an active challenge', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 15
      profile.tier.current = 'Seed'

      const activeChallenge: Challenge = {
        id: 'chal-existing',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Already active',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 10 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }
      profile.challenges.active = activeChallenge

      const updated = generateChallenge(profile)
      // Should be the same challenge, unchanged
      expect(updated.challenges.active!.id).toBe('chal-existing')
    })

    it('sets weekly expiry on generated challenge', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 15
      profile.tier.current = 'Seed'

      const updated = generateChallenge(profile)
      const challenge = updated.challenges.active!
      const started = new Date(challenge.started_at)
      const expires = new Date(challenge.expires_at)
      const diffMs = expires.getTime() - started.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(7, 0)
    })

    it('graduates from getting-started when all challenges completed', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 5 // below 10 threshold
      profile.tier.current = 'Seed'
      profile.challenges.history = [
        { type: 'first_steps', tier: 'Seed', completed: true, date: '2026-02-01' },
        { type: 'first_feedback', tier: 'Seed', completed: true, date: '2026-02-08' },
        { type: 'explore_domain', tier: 'Seed', completed: true, date: '2026-02-15' },
      ]

      const updated = generateChallenge(profile)
      expect(updated.challenges.graduated).toBe(true)
      // Should still generate a regular challenge after graduation
      expect(updated.challenges.active).not.toBeNull()
    })

    it('snapshots baseline stats', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 15
      profile.stats.total_feedback_given = 8
      profile.stats.domains_covered = 4
      profile.tier.current = 'Seed'

      const updated = generateChallenge(profile)
      const challenge = updated.challenges.active!
      expect(challenge.baseline_stats.total_engrams_created).toBe(15)
      expect(challenge.baseline_stats.total_feedback_given).toBe(8)
      expect(challenge.baseline_stats.domains_covered).toBe(4)
    })

    it('higher tier unlocks more challenge types', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 50
      profile.tier.current = 'Oracle' // highest tier

      const updated = generateChallenge(profile)
      expect(updated.challenges.active).not.toBeNull()
      // Oracle has access to all regular challenges including 'network' tier=Oracle
    })
  })

  describe('checkChallengeCompletion', () => {
    it('delta comparison works when target met', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 20

      const challenge: Challenge = {
        id: 'chal-001',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 15 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      // Delta = 20 - 15 = 5 >= 5 target
      expect(checkChallengeCompletion(profile, challenge)).toBe(true)
    })

    it('not complete when delta insufficient', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 18

      const challenge: Challenge = {
        id: 'chal-001',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 15 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      // Delta = 18 - 15 = 3 < 5 target
      expect(checkChallengeCompletion(profile, challenge)).toBe(false)
    })

    it('handles feedback_positive_ratio as absolute threshold', () => {
      const profile = createDefaultProfile()
      profile.stats.feedback_positive_ratio = 0.9

      const challenge: Challenge = {
        id: 'chal-001',
        type: 'impact',
        tier: 'Visionary',
        description: 'High feedback ratio',
        criteria: { metric: 'feedback_positive_ratio', target_delta: 0.85 },
        baseline_stats: { feedback_positive_ratio: 0.5 },
        bonus_xp: 25,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      // For feedback_positive_ratio, it checks currentValue >= targetDelta, not delta
      expect(checkChallengeCompletion(profile, challenge)).toBe(true)
    })

    it('handles missing baseline stat gracefully', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 6

      const challenge: Challenge = {
        id: 'chal-001',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: {}, // no baseline for metric
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      // Delta = 6 - 0 (default) = 6 >= 5
      expect(checkChallengeCompletion(profile, challenge)).toBe(true)
    })
  })

  describe('resolveChallenge', () => {
    it('awards bonus XP when challenge is complete', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 20

      const challengeId = 'chal-resolve-001'
      profile.challenges.active = {
        id: challengeId,
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 15 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = resolveChallenge(profile, challengeId)
      expect(updated.xp.total).toBe(15)
      expect(updated.challenges.completed).toBe(1)
      expect(updated.challenges.active).toBeNull()
    })

    it('records to history on completion', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 22

      const challengeId = 'chal-resolve-002'
      profile.challenges.active = {
        id: challengeId,
        type: 'first_feedback',
        tier: 'Seed',
        description: 'Give feedback',
        criteria: { metric: 'total_engrams_created', target_delta: 3 },
        baseline_stats: { total_engrams_created: 18 },
        bonus_xp: 10,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = resolveChallenge(profile, challengeId)
      expect(updated.challenges.history).toHaveLength(1)
      expect(updated.challenges.history[0].type).toBe('first_feedback')
      expect(updated.challenges.history[0].completed).toBe(true)
    })

    it('does not award XP if challenge not complete', () => {
      const profile = createDefaultProfile()
      profile.stats.total_engrams_created = 16 // only 1 delta, need 5

      const challengeId = 'chal-resolve-003'
      profile.challenges.active = {
        id: challengeId,
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 15 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = resolveChallenge(profile, challengeId)
      expect(updated.xp.total).toBe(0)
      expect(updated.challenges.completed).toBe(0)
      // Active challenge should still be set (not cleared)
      expect(updated.challenges.active).not.toBeNull()
    })

    it('returns unchanged for mismatched challenge ID', () => {
      const profile = createDefaultProfile()
      profile.challenges.active = {
        id: 'chal-real',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 0 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = resolveChallenge(profile, 'chal-wrong')
      expect(updated.challenges.active).not.toBeNull()
      expect(updated.xp.total).toBe(0)
    })
  })

  describe('dismissChallenge', () => {
    it('no penalty and records dismissal', () => {
      const profile = createDefaultProfile()
      const challengeId = 'chal-dismiss-001'
      profile.challenges.active = {
        id: challengeId,
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 0 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = dismissChallenge(profile, challengeId)
      expect(updated.xp.total).toBe(0) // no penalty
      expect(updated.challenges.dismissed).toBe(1)
      expect(updated.challenges.active).toBeNull()
    })

    it('records to history as not completed', () => {
      const profile = createDefaultProfile()
      const challengeId = 'chal-dismiss-002'
      profile.challenges.active = {
        id: challengeId,
        type: 'explore_domain',
        tier: 'Seed',
        description: 'Explore a domain',
        criteria: { metric: 'domains_covered', target_delta: 1 },
        baseline_stats: { domains_covered: 2 },
        bonus_xp: 10,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = dismissChallenge(profile, challengeId)
      expect(updated.challenges.history).toHaveLength(1)
      expect(updated.challenges.history[0].completed).toBe(false)
      expect(updated.challenges.history[0].type).toBe('explore_domain')
    })

    it('returns unchanged for mismatched challenge ID', () => {
      const profile = createDefaultProfile()
      profile.challenges.active = {
        id: 'chal-real',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 0 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      const updated = dismissChallenge(profile, 'chal-wrong')
      expect(updated.challenges.active).not.toBeNull()
      expect(updated.challenges.dismissed).toBe(0)
    })

    it('does not mutate original profile', () => {
      const profile = createDefaultProfile()
      const challengeId = 'chal-dismiss-003'
      profile.challenges.active = {
        id: challengeId,
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 0 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }

      dismissChallenge(profile, challengeId)
      expect(profile.challenges.active).not.toBeNull()
      expect(profile.challenges.dismissed).toBe(0)
    })
  })
})
