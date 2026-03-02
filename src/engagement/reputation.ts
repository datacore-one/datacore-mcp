// src/engagement/reputation.ts
import type { EngagementProfile } from './types.js'

export function calculateReputation(profile: EngagementProfile): number {
  // Feedback quality: positive_ratio * log(feedback_count) / log(100), capped 1.0
  const feedbackCount = profile.stats.total_feedback_given
  const feedbackQuality = feedbackCount > 0
    ? Math.min(1.0, profile.stats.feedback_positive_ratio * (Math.log(feedbackCount) / Math.log(100)))
    : 0

  // Verification bonus: 1.0 if erc8004_registered, else 0.0
  const verificationBonus = profile.identity.erc8004_registered ? 1.0 : 0.0

  // Stake signal: normalized, 0 in solo mode
  const stakeSignal = 0

  // Curation honesty: (revise + retire) / total_resolved, 0 if < 5 resolved
  const totalResolved = profile.reconsolidation.total_resolved
  const curationHonesty = totalResolved >= 5
    ? (profile.reconsolidation.outcomes.revised + profile.reconsolidation.outcomes.retired) / totalResolved
    : 0

  // Tenure signal: log(days_active) / log(365), capped 1.0
  let tenureDays = 0
  if (profile.stats.first_activity) {
    const first = new Date(profile.stats.first_activity)
    tenureDays = Math.max(0, Math.floor((Date.now() - first.getTime()) / 86400000))
  }
  const tenureSignal = tenureDays > 0
    ? Math.min(1.0, Math.log(tenureDays) / Math.log(365))
    : 0

  // Domain breadth: min(domains / 10, 1.0)
  const domainBreadth = Math.min(1.0, profile.stats.domains_covered / 10)

  // Conflict penalty: slashed_stakes / total_stakes, 0 if no stakes (solo mode)
  const conflictPenalty = 0

  const score = (0.30 * feedbackQuality)
    + (0.25 * verificationBonus)
    + (0.15 * stakeSignal)
    + (0.15 * curationHonesty)
    + (0.10 * tenureSignal)
    + (0.05 * domainBreadth)
    - (0.50 * conflictPenalty)

  return Math.max(0, score)
}

export function updateReputation(profile: EngagementProfile): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  const score = calculateReputation(updated)
  updated.reputation.score = Math.round(score * 100) / 100
  updated.reputation.last_calculated = new Date().toISOString().split('T')[0]
  return updated
}
