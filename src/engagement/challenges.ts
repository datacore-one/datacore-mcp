// src/engagement/challenges.ts — weekly challenges
import type { EngagementProfile, Challenge, ChallengeHistory } from './types.js'

// === Challenge definitions ===

interface ChallengeTemplate {
  type: string
  tier: string
  description: string
  metric: string
  target_delta: number
  bonus_xp: number
}

const GETTING_STARTED_CHALLENGES: ChallengeTemplate[] = [
  {
    type: 'first_steps',
    tier: 'Seed',
    description: 'Create your first engram',
    metric: 'total_engrams_created',
    target_delta: 5,
    bonus_xp: 15,
  },
  {
    type: 'first_feedback',
    tier: 'Seed',
    description: 'Give feedback',
    metric: 'total_feedback_given',
    target_delta: 3,
    bonus_xp: 10,
  },
  {
    type: 'explore_domain',
    tier: 'Seed',
    description: 'Explore a new domain',
    metric: 'domains_covered',
    target_delta: 1,
    bonus_xp: 10,
  },
]

const REGULAR_CHALLENGES: ChallengeTemplate[] = [
  {
    type: 'first_steps',
    tier: 'Seed',
    description: 'Create your first engram',
    metric: 'total_engrams_created',
    target_delta: 5,
    bonus_xp: 15,
  },
  {
    type: 'first_feedback',
    tier: 'Seed',
    description: 'Give feedback',
    metric: 'total_feedback_given',
    target_delta: 3,
    bonus_xp: 10,
  },
  {
    type: 'domain_deep_dive',
    tier: 'Cipher',
    description: 'Deep dive into a new domain',
    metric: 'domains_covered',
    target_delta: 1,
    bonus_xp: 15,
  },
  {
    type: 'synthesis',
    tier: 'Sage',
    description: 'Synthesize knowledge across domains',
    metric: 'domains_covered',
    target_delta: 2,
    bonus_xp: 20,
  },
  {
    type: 'mentorship',
    tier: 'Adept',
    description: 'Share your knowledge by exporting a pack',
    metric: 'total_packs_exported',
    target_delta: 1,
    bonus_xp: 25,
  },
  {
    type: 'impact',
    tier: 'Visionary',
    description: 'Achieve a high positive feedback ratio',
    metric: 'feedback_positive_ratio',
    target_delta: 0.85,
    bonus_xp: 25,
  },
  {
    type: 'network',
    tier: 'Oracle',
    description: 'Build your feedback network',
    metric: 'total_feedback_received',
    target_delta: 10,
    bonus_xp: 30,
  },
]

// === Tier ordering ===

const TIER_ORDER: Record<string, number> = {
  Seed: 0,
  Cipher: 1,
  Sage: 2,
  Adept: 3,
  Visionary: 4,
  Oracle: 5,
}

function tierRank(tier: string): number {
  return TIER_ORDER[tier] ?? 0
}

// === Constants ===

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const GETTING_STARTED_THRESHOLD = 10

// === Core functions ===

export function generateChallenge(profile: EngagementProfile): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))

  // Only one active at a time
  if (updated.challenges.active) return updated

  const now = new Date()
  const expiresAt = new Date(now.getTime() + WEEK_MS)
  const currentTierRank = tierRank(updated.tier.current)

  // Pick challenge pool
  let pool: ChallengeTemplate[]

  if (updated.stats.total_engrams_created < GETTING_STARTED_THRESHOLD && !updated.challenges.graduated) {
    // Getting-started track
    const completedTypes = new Set(
      updated.challenges.history
        .filter(h => h.completed)
        .map(h => h.type),
    )

    pool = GETTING_STARTED_CHALLENGES.filter(c => !completedTypes.has(c.type))

    // If all getting-started challenges completed, graduate
    if (pool.length === 0) {
      updated.challenges.graduated = true
      pool = REGULAR_CHALLENGES.filter(c => tierRank(c.tier) <= currentTierRank)
    }
  } else {
    // Regular challenges: filter by tier
    pool = REGULAR_CHALLENGES.filter(c => tierRank(c.tier) <= currentTierRank)
  }

  if (pool.length === 0) return updated

  // Pick one (round-robin to avoid repeats)
  const recentTypes = new Set(
    updated.challenges.history.slice(-3).map(h => h.type),
  )
  let chosen = pool.find(c => !recentTypes.has(c.type))
  if (!chosen) chosen = pool[0]

  // Snapshot baseline stats
  const baselineStats: Record<string, number> = {}
  for (const [key, value] of Object.entries(updated.stats)) {
    if (typeof value === 'number') {
      baselineStats[key] = value
    }
  }

  const id = `chal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const challenge: Challenge = {
    id,
    type: chosen.type,
    tier: chosen.tier,
    description: chosen.description,
    criteria: {
      metric: chosen.metric,
      target_delta: chosen.target_delta,
    },
    baseline_stats: baselineStats,
    bonus_xp: chosen.bonus_xp,
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  }

  updated.challenges.active = challenge
  return updated
}

export function checkChallengeCompletion(
  profile: EngagementProfile,
  challenge: Challenge,
): boolean {
  const metric = challenge.criteria.metric
  const targetDelta = challenge.criteria.target_delta
  const baselineValue = challenge.baseline_stats[metric] ?? 0

  // Special case: feedback_positive_ratio is an absolute threshold, not a delta
  if (metric === 'feedback_positive_ratio') {
    const currentValue = (profile.stats as Record<string, number>)[metric] ?? 0
    return currentValue >= targetDelta
  }

  const currentValue = (profile.stats as Record<string, number>)[metric] ?? 0
  const delta = currentValue - baselineValue

  return delta >= targetDelta
}

export function resolveChallenge(
  profile: EngagementProfile,
  challengeId: string,
): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))

  if (!updated.challenges.active || updated.challenges.active.id !== challengeId) {
    return updated
  }

  const challenge = updated.challenges.active

  // Check completion
  if (!checkChallengeCompletion(updated, challenge)) {
    return updated
  }

  // Award bonus XP
  updated.xp.total += challenge.bonus_xp

  // Record in history
  const entry: ChallengeHistory = {
    type: challenge.type,
    tier: challenge.tier,
    completed: true,
    date: new Date().toISOString().split('T')[0],
  }
  updated.challenges.history.push(entry)
  updated.challenges.completed++
  updated.challenges.active = null

  return updated
}

export function dismissChallenge(
  profile: EngagementProfile,
  challengeId: string,
): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))

  if (!updated.challenges.active || updated.challenges.active.id !== challengeId) {
    return updated
  }

  const challenge = updated.challenges.active

  // Record in history as not completed
  const entry: ChallengeHistory = {
    type: challenge.type,
    tier: challenge.tier,
    completed: false,
    date: new Date().toISOString().split('T')[0],
  }
  updated.challenges.history.push(entry)
  updated.challenges.dismissed++
  updated.challenges.active = null

  // No penalty — 0 XP
  return updated
}
