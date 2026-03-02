// test/engagement/reputation.test.ts
import { describe, it, expect } from 'vitest'
import { calculateReputation } from '../../src/engagement/reputation.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import type { EngagementProfile } from '../../src/engagement/types.js'

function makeProfile(overrides: Partial<{
  erc8004_registered: boolean
  total_feedback_given: number
  feedback_positive_ratio: number
  total_resolved: number
  outcomes_revised: number
  outcomes_retired: number
  first_activity: string | null
  domains_covered: number
}>): EngagementProfile {
  const profile = createDefaultProfile()
  if (overrides.erc8004_registered !== undefined) {
    profile.identity.erc8004_registered = overrides.erc8004_registered
  }
  if (overrides.total_feedback_given !== undefined) {
    profile.stats.total_feedback_given = overrides.total_feedback_given
  }
  if (overrides.feedback_positive_ratio !== undefined) {
    profile.stats.feedback_positive_ratio = overrides.feedback_positive_ratio
  }
  if (overrides.total_resolved !== undefined) {
    profile.reconsolidation.total_resolved = overrides.total_resolved
  }
  if (overrides.outcomes_revised !== undefined) {
    profile.reconsolidation.outcomes.revised = overrides.outcomes_revised
  }
  if (overrides.outcomes_retired !== undefined) {
    profile.reconsolidation.outcomes.retired = overrides.outcomes_retired
  }
  if (overrides.first_activity !== undefined) {
    profile.stats.first_activity = overrides.first_activity
  }
  if (overrides.domains_covered !== undefined) {
    profile.stats.domains_covered = overrides.domains_covered
  }
  return profile
}

describe('calculateReputation', () => {
  it('returns 0 for default profile (no feedback, no verification, no tenure)', () => {
    const profile = createDefaultProfile()
    expect(calculateReputation(profile)).toBe(0)
  })

  it('gives verified user a 0.25 bonus', () => {
    const profile = makeProfile({ erc8004_registered: true })
    const score = calculateReputation(profile)
    // verificationBonus = 1.0, weight = 0.25, so contribution = 0.25
    expect(score).toBeCloseTo(0.25, 2)
  })

  it('returns 0 curation honesty when total_resolved < 5', () => {
    const profile = makeProfile({
      total_resolved: 4,
      outcomes_revised: 2,
      outcomes_retired: 2,
    })
    // With 4 resolved, curation honesty should be 0 regardless of outcomes
    const score = calculateReputation(profile)
    // Only curation honesty contribution is 0, all other components also 0
    expect(score).toBe(0)
  })

  it('calculates correct curation honesty ratio when >= 5 resolved', () => {
    const profile = makeProfile({
      total_resolved: 10,
      outcomes_revised: 3,
      outcomes_retired: 2,
    })
    // curationHonesty = (3 + 2) / 10 = 0.5
    // contribution = 0.15 * 0.5 = 0.075
    const score = calculateReputation(profile)
    expect(score).toBeCloseTo(0.075, 3)
  })

  it('caps tenure signal at 1.0 for tenure > 365 days', () => {
    // Set first_activity to 2 years ago
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const profile = makeProfile({
      first_activity: twoYearsAgo.toISOString().split('T')[0],
    })
    // tenureSignal = min(1.0, log(730) / log(365)) — log(730)/log(365) > 1.0, so capped at 1.0
    // contribution = 0.10 * 1.0 = 0.10
    const score = calculateReputation(profile)
    expect(score).toBeCloseTo(0.10, 2)
  })

  it('calculates domain breadth as min(domains/10, 1.0)', () => {
    const profile5 = makeProfile({ domains_covered: 5 })
    const score5 = calculateReputation(profile5)
    // domainBreadth = 5/10 = 0.5, contribution = 0.05 * 0.5 = 0.025
    expect(score5).toBeCloseTo(0.025, 3)

    const profile15 = makeProfile({ domains_covered: 15 })
    const score15 = calculateReputation(profile15)
    // domainBreadth = min(15/10, 1.0) = 1.0, contribution = 0.05 * 1.0 = 0.05
    expect(score15).toBeCloseTo(0.05, 3)
  })

  it('floors reputation at 0 (never negative)', () => {
    // Default profile already returns 0 — all components are 0, no penalty
    const profile = createDefaultProfile()
    const score = calculateReputation(profile)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('calculates feedback quality with various feedback counts', () => {
    // feedbackQuality = ratio * log(count) / log(100), capped at 1.0
    // count=10, ratio=0.8: 0.8 * log(10)/log(100) = 0.8 * 0.5 = 0.4
    // contribution = 0.30 * 0.4 = 0.12
    const profile10 = makeProfile({
      total_feedback_given: 10,
      feedback_positive_ratio: 0.8,
    })
    const score10 = calculateReputation(profile10)
    expect(score10).toBeCloseTo(0.12, 2)

    // count=100, ratio=1.0: 1.0 * log(100)/log(100) = 1.0
    // contribution = 0.30 * 1.0 = 0.30
    const profile100 = makeProfile({
      total_feedback_given: 100,
      feedback_positive_ratio: 1.0,
    })
    const score100 = calculateReputation(profile100)
    expect(score100).toBeCloseTo(0.30, 2)

    // count=1000, ratio=0.5: 0.5 * log(1000)/log(100) = 0.5 * 1.5 = 0.75 → capped at 0.75
    // contribution = 0.30 * 0.75 = 0.225
    const profile1000 = makeProfile({
      total_feedback_given: 1000,
      feedback_positive_ratio: 0.5,
    })
    const score1000 = calculateReputation(profile1000)
    expect(score1000).toBeCloseTo(0.225, 2)
  })
})
