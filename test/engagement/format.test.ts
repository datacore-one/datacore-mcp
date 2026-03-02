// test/engagement/format.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import {
  formatSessionStart,
  formatSessionEnd,
  formatStatus,
  formatTierUp,
  formatReconsolidation,
  formatDiscovery,
  formatChallenge,
  formatGettingStartedGraduation,
} from '../../src/engagement/format.js'
import type { XPEvent } from '../../src/engagement/types.js'

describe('engagement/format', () => {
  const tmpDir = path.join(os.tmpdir(), 'format-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('formatSessionStart', () => {
    it('shows tier, XP, and next tier info', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Cipher'
      profile.xp.total = 150
      profile.consistency.active_days_30 = 10

      const output = formatSessionStart(profile)
      expect(output).toContain('Cipher')
      expect(output).toContain('150')
      expect(output).toContain('Sage') // next tier
      expect(output).toContain('350') // 500 - 150 = 350 XP to next
    })

    it('shows multiplier when active', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Seed'
      profile.xp.total = 50
      profile.multipliers.effective = 1.5
      profile.multipliers.active = [{ type: 'verified', factor: 1.5, since: '2026-03-01' }]
      profile.consistency.active_days_30 = 5

      const output = formatSessionStart(profile)
      expect(output).toContain('1.5x')
      expect(output).toContain('verified')
    })

    it('does not show multiplier when 1.0', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Seed'
      profile.xp.total = 0
      profile.consistency.active_days_30 = 0

      const output = formatSessionStart(profile)
      expect(output).not.toContain('x ')
    })

    it('shows max tier when at Oracle', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Oracle'
      profile.xp.total = 6000
      profile.consistency.active_days_30 = 20

      const output = formatSessionStart(profile)
      expect(output).toContain('max tier')
    })

    it('shows AI performance when feedback count > 0', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Seed'
      profile.xp.total = 10
      profile.ai_performance.feedback_count = 5
      profile.ai_performance.helpful_ratio = 0.8
      profile.ai_performance.total_injections = 20
      profile.consistency.active_days_30 = 3

      const output = formatSessionStart(profile)
      expect(output).toContain('20 insights')
      expect(output).toContain('80%')
    })

    it('shows active days', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Seed'
      profile.xp.total = 0
      profile.consistency.active_days_30 = 15

      const output = formatSessionStart(profile)
      expect(output).toContain('15/30')
    })
  })

  describe('formatSessionEnd', () => {
    it('shows earned XP', () => {
      const profile = createDefaultProfile()
      const events: XPEvent[] = [
        {
          action_key: 'engram_created',
          xp_base: 10,
          multiplier: 1.0,
          xp_earned: 10,
          timestamp: new Date().toISOString(),
          context: { domain: 'software' },
        },
      ]

      const output = formatSessionEnd(profile, 10, events)
      expect(output).toContain('+10 XP')
    })

    it('zero XP session handled', () => {
      const profile = createDefaultProfile()
      const output = formatSessionEnd(profile, 0, [])
      expect(output).toContain('no XP earned')
    })

    it('shows multiplier in session end when active', () => {
      const profile = createDefaultProfile()
      profile.multipliers.effective = 2.0
      profile.multipliers.active = [
        { type: 'verified', factor: 1.5, since: '2026-03-01' },
        { type: 'streak', factor: 1.33, since: '2026-03-01' },
      ]

      const events: XPEvent[] = [
        {
          action_key: 'engram_created',
          xp_base: 10,
          multiplier: 2.0,
          xp_earned: 20,
          timestamp: new Date().toISOString(),
        },
      ]

      const output = formatSessionEnd(profile, 20, events)
      expect(output).toContain('+20 XP')
      expect(output).toContain('2')
    })

    it('shows domain note when events have domain context', () => {
      const profile = createDefaultProfile()
      const events: XPEvent[] = [
        {
          action_key: 'engram_created',
          xp_base: 10,
          multiplier: 1.0,
          xp_earned: 10,
          timestamp: new Date().toISOString(),
          context: { domain: 'trading' },
        },
      ]

      const output = formatSessionEnd(profile, 10, events)
      expect(output).toContain('trading')
    })
  })

  describe('formatStatus', () => {
    it('contains dashboard sections', () => {
      const profile = createDefaultProfile()
      profile.tier.current = 'Cipher'
      profile.xp.total = 200
      profile.xp.this_week = 30
      profile.consistency.active_days_30 = 12
      profile.consistency.best_run = 5
      profile.stats.total_engrams_created = 20
      profile.stats.total_feedback_given = 10
      profile.stats.domains_covered = 3
      profile.stats.total_packs_exported = 1

      const output = formatStatus(profile)
      expect(output).toContain('Engagement Dashboard')
      expect(output).toContain('Tier:')
      expect(output).toContain('Cipher')
      expect(output).toContain('200')
      expect(output).toContain('This week:')
      expect(output).toContain('30')
      expect(output).toContain('Consistency:')
      expect(output).toContain('12/30')
      expect(output).toContain('Stats:')
      expect(output).toContain('20')
      expect(output).toContain('10')
    })

    it('shows active challenge when present', () => {
      const profile = createDefaultProfile()
      profile.challenges.active = {
        id: 'chal-001',
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create your first engram',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 0 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: '2026-03-08',
      }

      const output = formatStatus(profile)
      expect(output).toContain('Active Challenge')
      expect(output).toContain('Create your first engram')
    })

    it('shows pending contradictions when present', () => {
      const profile = createDefaultProfile()
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'A',
        contradiction: 'B',
        evidence_strength: 'strong',
        confidence: 0.9,
        detected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })

      const output = formatStatus(profile)
      expect(output).toContain('Pending Contradictions')
      expect(output).toContain('1')
    })

    it('shows reputation when > 0', () => {
      const profile = createDefaultProfile()
      profile.reputation.score = 0.75

      const output = formatStatus(profile)
      expect(output).toContain('Reputation')
      expect(output).toContain('0.75')
    })

    it('shows multipliers when active', () => {
      const profile = createDefaultProfile()
      profile.multipliers.active = [
        { type: 'verified', factor: 1.5, since: '2026-03-01' },
      ]
      profile.multipliers.effective = 1.5

      const output = formatStatus(profile)
      expect(output).toContain('Multipliers')
      expect(output).toContain('verified')
      expect(output).toContain('1.5')
    })
  })

  describe('formatTierUp', () => {
    it('shows from and to tiers', () => {
      const output = formatTierUp('Seed', 'Cipher')
      expect(output).toContain('Seed')
      expect(output).toContain('Cipher')
      expect(output).toContain('Tier Up')
    })
  })

  describe('formatReconsolidation', () => {
    it('formats contradiction with actions', () => {
      const output = formatReconsolidation({
        engram_id: 'ENG-001',
        statement: 'Always use tabs',
        contradiction: 'Always use spaces',
        evidence_strength: 'strong',
      })
      expect(output).toContain('Contradiction Detected')
      expect(output).toContain('Always use tabs')
      expect(output).toContain('Always use spaces')
      expect(output).toContain('strong')
      expect(output).toContain('Defend')
      expect(output).toContain('Revise')
      expect(output).toContain('Retire')
      expect(output).toContain('Dismiss')
      expect(output).toContain('ENG-001')
    })
  })

  describe('formatDiscovery', () => {
    it('formats discovery with connection and actions', () => {
      const output = formatDiscovery({
        id: 'disc-001',
        engram_a: { statement: 'Modular architecture', domain: 'software' },
        engram_b: { statement: 'Team structure', domain: 'management' },
        connection: 'Both use decomposition for complexity management.',
      })
      expect(output).toContain('Cross-Domain Discovery')
      expect(output).toContain('Modular architecture')
      expect(output).toContain('software')
      expect(output).toContain('Team structure')
      expect(output).toContain('management')
      expect(output).toContain('Both use decomposition')
      expect(output).toContain('Explore +20 XP')
      expect(output).toContain('Note')
      expect(output).toContain('disc-001')
    })
  })

  describe('formatChallenge', () => {
    it('formats challenge with bonus XP and expiry', () => {
      const output = formatChallenge({
        id: 'chal-001',
        description: 'Create 5 engrams this week',
        bonus_xp: 15,
        expires_at: '2026-03-08',
      })
      expect(output).toContain('Weekly Challenge')
      expect(output).toContain('Create 5 engrams this week')
      expect(output).toContain('+15 XP')
      expect(output).toContain('2026-03-08')
      expect(output).toContain('chal-001')
    })
  })

  describe('formatGettingStartedGraduation', () => {
    it('returns graduation message', () => {
      const output = formatGettingStartedGraduation()
      expect(output).toContain('Weekly challenges unlocked')
    })
  })
})
