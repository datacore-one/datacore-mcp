// src/engagement/multipliers.ts
import type { EngagementProfile, MultiplierEntry } from './types.js'

export function evaluateMultipliers(profile: EngagementProfile): MultiplierEntry[] {
  const today = new Date().toISOString().split('T')[0]
  const multipliers: MultiplierEntry[] = []

  // Verified multiplier: 1.5x when erc8004_registered
  if (profile.identity.erc8004_registered) {
    multipliers.push({ type: 'verified', factor: 1.5, since: today })
  }

  // Top Teacher: 1.25x when 3+ packs, 20+ feedback, positive ratio >= 0.85
  if (
    profile.stats.total_packs_exported >= 3 &&
    profile.stats.total_feedback_received >= 20 &&
    profile.stats.feedback_positive_ratio >= 0.85
  ) {
    multipliers.push({ type: 'top_teacher', factor: 1.25, since: today })
  }

  // Top Learner: 1.25x when 5+ reconsolidations, 3+ discoveries, response_rate >= 0.8, explore_rate >= 0.5
  if (
    profile.reconsolidation.total_resolved >= 5 &&
    profile.discoveries.total >= 3 &&
    profile.reconsolidation.response_rate >= 0.8 &&
    profile.discoveries.explore_rate >= 0.5
  ) {
    multipliers.push({ type: 'top_learner', factor: 1.25, since: today })
  }

  return multipliers
}

export function recalculateWeekly(profile: EngagementProfile): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  const newMultipliers = evaluateMultipliers(updated)

  updated.multipliers.active = newMultipliers

  let effective = 1.0
  for (const m of newMultipliers) {
    effective *= m.factor
  }
  updated.multipliers.effective = effective

  // Recompute this_week from history (start of ISO week = Monday)
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - diff)
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  updated.xp.this_week = updated.xp.history
    .filter(h => h.date >= weekStartStr)
    .reduce((sum, h) => sum + h.earned, 0)

  return updated
}
