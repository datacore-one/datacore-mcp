// test/engagement/types.test.ts
import { describe, it, expect } from 'vitest'
import {
  EngagementProfileSchema,
  ChallengeSchema,
  DiscoverySchema,
  XPEventSchema,
  IdentitySchema,
  MultiplierEntrySchema,
  XPActionSchema,
  XPActionRegistrySchema,
  TIER_THRESHOLDS,
} from '../../src/engagement/types.js'

describe('EngagementProfileSchema', () => {
  it('fills all defaults from minimal input', () => {
    const profile = EngagementProfileSchema.parse({ version: 4 })
    expect(profile.version).toBe(4)
    expect(profile.identity.mode).toBe('private')
    expect(profile.identity.pseudonym).toBeNull()
    expect(profile.identity.erc8004_address).toBeNull()
    expect(profile.identity.erc8004_registered).toBe(false)
    expect(profile.xp.total).toBe(0)
    expect(profile.xp.this_week).toBe(0)
    expect(profile.xp.history).toEqual([])
    expect(profile.tier.current).toBe('Seed')
    expect(profile.tier.achieved_at).toBeNull()
    expect(profile.tier.history).toEqual([])
    expect(profile.multipliers.active).toEqual([])
    expect(profile.multipliers.effective).toBe(1.0)
    expect(profile.consistency.active_days_30).toBe(0)
    expect(profile.consistency.best_run).toBe(0)
    expect(profile.consistency.last_active).toBeNull()
    expect(profile.challenges.active).toBeNull()
    expect(profile.challenges.completed).toBe(0)
    expect(profile.challenges.dismissed).toBe(0)
    expect(profile.challenges.graduated).toBe(false)
    expect(profile.challenges.history).toEqual([])
    expect(profile.reconsolidation.pending).toEqual([])
    expect(profile.reconsolidation.total_resolved).toBe(0)
    expect(profile.reconsolidation.outcomes.defended).toBe(0)
    expect(profile.reconsolidation.outcomes.revised).toBe(0)
    expect(profile.reconsolidation.outcomes.retired).toBe(0)
    expect(profile.reconsolidation.outcomes.dismissed).toBe(0)
    expect(profile.reconsolidation.response_rate).toBe(0)
    expect(profile.discoveries.pending).toEqual([])
    expect(profile.discoveries.total).toBe(0)
    expect(profile.discoveries.last_offered).toBeNull()
    expect(profile.discoveries.explored).toBe(0)
    expect(profile.discoveries.noted).toBe(0)
    expect(profile.discoveries.explore_rate).toBe(0)
    expect(profile.ai_performance.total_injections).toBe(0)
    expect(profile.ai_performance.feedback_count).toBe(0)
    expect(profile.ai_performance.helpful_ratio).toBe(0)
    expect(profile.ai_performance.top_engrams).toEqual([])
    expect(profile.ai_performance.unused_60d).toEqual([])
    expect(profile.reputation.score).toBe(0)
    expect(profile.reputation.last_calculated).toBeNull()
    expect(profile.leaderboard.mode).toBe('private')
    expect(profile.leaderboard.display_name).toBeNull()
    expect(profile.leaderboard.position).toBeNull()
    expect(profile.badge.preview_svg).toBeNull()
    expect(profile.badge.nft_token_id).toBeNull()
    expect(profile.badge.last_generated).toBeNull()
    expect(profile.stats.total_engrams_created).toBe(0)
    expect(profile.stats.total_feedback_given).toBe(0)
    expect(profile.stats.total_engrams_retired).toBe(0)
    expect(profile.stats.total_packs_exported).toBe(0)
    expect(profile.stats.total_feedback_received).toBe(0)
    expect(profile.stats.feedback_positive_ratio).toBe(0)
    expect(profile.stats.domains_covered).toBe(0)
    expect(profile.stats.public_engrams).toBe(0)
    expect(profile.stats.first_activity).toBeNull()
  })

  it('rejects missing version', () => {
    expect(() => EngagementProfileSchema.parse({})).toThrow()
  })

  it('rejects wrong version number', () => {
    expect(() => EngagementProfileSchema.parse({ version: 3 })).toThrow()
  })

  it('accepts profile with partial overrides', () => {
    const profile = EngagementProfileSchema.parse({
      version: 4,
      xp: { total: 250, this_week: 30 },
      tier: { current: 'Cipher' },
    })
    expect(profile.xp.total).toBe(250)
    expect(profile.xp.this_week).toBe(30)
    expect(profile.xp.history).toEqual([])
    expect(profile.tier.current).toBe('Cipher')
    expect(profile.tier.achieved_at).toBeNull()
    // Other sections still get defaults
    expect(profile.identity.mode).toBe('private')
    expect(profile.stats.total_engrams_created).toBe(0)
  })

  it('rejects non-object input', () => {
    expect(() => EngagementProfileSchema.parse('not an object')).toThrow()
    expect(() => EngagementProfileSchema.parse(42)).toThrow()
    expect(() => EngagementProfileSchema.parse(null)).toThrow()
  })
})

describe('ChallengeSchema', () => {
  const validChallenge = {
    id: 'ch-001',
    type: 'weekly',
    tier: 'Cipher',
    description: 'Create 3 engrams this week',
    criteria: { metric: 'engrams_created', target_delta: 3 },
    baseline_stats: { engrams_created: 10 },
    bonus_xp: 50,
    started_at: '2026-03-01',
    expires_at: '2026-03-07',
  }

  it('accepts a valid challenge', () => {
    const result = ChallengeSchema.parse(validChallenge)
    expect(result.id).toBe('ch-001')
    expect(result.criteria.metric).toBe('engrams_created')
    expect(result.criteria.target_delta).toBe(3)
    expect(result.bonus_xp).toBe(50)
  })

  it('rejects challenge missing required fields', () => {
    expect(() => ChallengeSchema.parse({ id: 'ch-001' })).toThrow()
    expect(() => ChallengeSchema.parse({ ...validChallenge, criteria: undefined })).toThrow()
    expect(() => ChallengeSchema.parse({ ...validChallenge, bonus_xp: undefined })).toThrow()
  })
})

describe('DiscoverySchema', () => {
  const validDiscovery = {
    id: 'disc-001',
    engram_a: { id: 'ENG-001', domain: 'software', statement: 'Use TDD' },
    engram_b: { id: 'ENG-002', domain: 'cooking', statement: 'Taste as you go' },
    connection: 'Both emphasize iterative feedback loops',
    offered_at: '2026-03-01T10:00:00Z',
  }

  it('accepts a valid discovery', () => {
    const result = DiscoverySchema.parse(validDiscovery)
    expect(result.id).toBe('disc-001')
    expect(result.engram_a.domain).toBe('software')
    expect(result.engram_b.domain).toBe('cooking')
    expect(result.connection).toBe('Both emphasize iterative feedback loops')
  })

  it('rejects discovery missing engram_b', () => {
    const { engram_b, ...incomplete } = validDiscovery
    expect(() => DiscoverySchema.parse(incomplete)).toThrow()
  })

  it('rejects discovery with malformed engram', () => {
    expect(() => DiscoverySchema.parse({
      ...validDiscovery,
      engram_a: { id: 'ENG-001' }, // missing domain and statement
    })).toThrow()
  })
})

describe('XPEventSchema', () => {
  it('accepts a valid event', () => {
    const event = XPEventSchema.parse({
      action_key: 'engram_created',
      xp_base: 10,
      multiplier: 1.5,
      xp_earned: 15,
      timestamp: '2026-03-01T10:00:00Z',
    })
    expect(event.action_key).toBe('engram_created')
    expect(event.xp_earned).toBe(15)
    expect(event.context).toBeUndefined()
  })

  it('accepts event with optional context', () => {
    const event = XPEventSchema.parse({
      action_key: 'feedback_given',
      xp_base: 5,
      multiplier: 1.0,
      xp_earned: 5,
      timestamp: '2026-03-01T10:00:00Z',
      context: { engram_id: 'ENG-001', signal: 'positive' },
    })
    expect(event.context).toEqual({ engram_id: 'ENG-001', signal: 'positive' })
  })

  it('rejects event missing required fields', () => {
    expect(() => XPEventSchema.parse({
      action_key: 'engram_created',
      xp_base: 10,
      // missing multiplier, xp_earned, timestamp
    })).toThrow()
  })

  it('rejects event with wrong types', () => {
    expect(() => XPEventSchema.parse({
      action_key: 123,
      xp_base: 'ten',
      multiplier: 1.0,
      xp_earned: 10,
      timestamp: '2026-03-01',
    })).toThrow()
  })
})

describe('TIER_THRESHOLDS', () => {
  it('has 6 tiers in ascending order', () => {
    expect(TIER_THRESHOLDS).toHaveLength(6)
    for (let i = 1; i < TIER_THRESHOLDS.length; i++) {
      expect(TIER_THRESHOLDS[i].minXP).toBeGreaterThan(TIER_THRESHOLDS[i - 1].minXP)
    }
  })

  it('starts at Seed with 0 XP', () => {
    expect(TIER_THRESHOLDS[0]).toEqual({ name: 'Seed', minXP: 0 })
  })

  it('ends at Oracle with 5000 XP', () => {
    expect(TIER_THRESHOLDS[5]).toEqual({ name: 'Oracle', minXP: 5000 })
  })
})
