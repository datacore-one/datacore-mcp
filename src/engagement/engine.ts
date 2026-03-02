// src/engagement/engine.ts — pure functions, never mutate input
import { TIER_THRESHOLDS, type EngagementProfile, type XPActionRegistry, type XPEvent } from './types.js'

interface TierResult {
  current: string
  changed: boolean
  message?: string
}

interface AwardResult {
  event: XPEvent
  profile: EngagementProfile
}

interface EligibilityResult {
  eligible: boolean
  reason?: string
}

export function resolveTier(profile: EngagementProfile): TierResult {
  const xp = profile.xp.total
  let current = 'Seed'
  for (const t of TIER_THRESHOLDS) {
    if (xp >= t.minXP) current = t.name
  }
  const changed = current !== profile.tier.current
  const message = changed ? `You've reached ${current}!` : undefined
  return { current, changed, message }
}

export function getEffectiveMultiplier(profile: EngagementProfile): { effective: number; active: typeof profile.multipliers.active } {
  const actives = profile.multipliers.active
  if (actives.length === 0) return { effective: 1.0, active: [] }

  let effective = 1.0
  for (const m of actives) {
    effective *= m.factor
  }
  return { effective, active: actives }
}

export function isActionEligible(
  profile: EngagementProfile,
  actionKey: string,
  actions: XPActionRegistry,
  context?: Record<string, unknown>,
): EligibilityResult {
  const action = actions.actions[actionKey]
  if (!action) return { eligible: false, reason: `Unknown action: ${actionKey}` }

  // Check daily limit
  if (action.daily_limit !== undefined) {
    const today = new Date().toISOString().split('T')[0]
    const todayEntry = profile.xp.history.find(h => h.date === today)
    if (todayEntry) {
      const todayCount = todayEntry.actions.filter(a => a === actionKey).length
      if (todayCount >= action.daily_limit) {
        return { eligible: false, reason: `Daily limit of ${action.daily_limit} reached for ${actionKey}` }
      }
    }
  }

  // Check cooldown
  if (action.cooldown_days !== undefined && context?.engram_age_days !== undefined) {
    const ageDays = context.engram_age_days as number
    if (ageDays < action.cooldown_days) {
      return { eligible: false, reason: `Cooldown: engram must be at least ${action.cooldown_days} days old (current: ${ageDays})` }
    }
  }

  return { eligible: true }
}

export function awardXP(
  profile: EngagementProfile,
  actionKey: string,
  actions: XPActionRegistry,
  context?: Record<string, unknown>,
): AwardResult | null {
  const eligibility = isActionEligible(profile, actionKey, actions, context)
  if (!eligibility.eligible) return null

  const action = actions.actions[actionKey]
  const { effective } = getEffectiveMultiplier(profile)
  const baseXP = action.xp
  const earnedXP = Math.round(baseXP * effective)
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  const event: XPEvent = {
    action_key: actionKey,
    xp_base: baseXP,
    multiplier: effective,
    xp_earned: earnedXP,
    timestamp: now,
    context,
  }

  // Deep clone profile to avoid mutation
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  updated.xp.total += earnedXP
  updated.xp.this_week += earnedXP

  // Update XP history
  let todayEntry = updated.xp.history.find(h => h.date === today)
  if (!todayEntry) {
    todayEntry = { date: today, earned: 0, base_earned: 0, multiplier: effective, actions: [] }
    updated.xp.history.push(todayEntry)
  }
  todayEntry.earned += earnedXP
  todayEntry.base_earned += baseXP
  todayEntry.actions.push(actionKey)

  // Update stat counters
  if (actionKey === 'engram_created' || actionKey === 'engram_created_public') {
    updated.stats.total_engrams_created++
  }
  if (actionKey === 'feedback_given') {
    updated.stats.total_feedback_given++
  }
  if (actionKey === 'engram_retired') {
    updated.stats.total_engrams_retired++
  }
  if (actionKey === 'pack_exported') {
    updated.stats.total_packs_exported++
  }
  if (actionKey === 'new_domain') {
    updated.stats.domains_covered++
  }

  if (!updated.stats.first_activity) {
    updated.stats.first_activity = today
  }

  return { event, profile: updated }
}

export function updateConsistency(profile: EngagementProfile): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  const today = new Date().toISOString().split('T')[0]

  if (updated.consistency.last_active === today) return updated

  // Count active days in last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0]

  const activeDays = updated.xp.history
    .filter(h => h.date >= cutoff && h.date <= today)
    .length

  updated.consistency.active_days_30 = activeDays
  updated.consistency.last_active = today

  // Calculate best consecutive run
  const sortedDates = updated.xp.history
    .map(h => h.date)
    .sort()

  let currentRun = 1
  let bestRun = updated.consistency.best_run
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1])
    const curr = new Date(sortedDates[i])
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (86400000))
    if (diffDays === 1) {
      currentRun++
      if (currentRun > bestRun) bestRun = currentRun
    } else if (diffDays > 1) {
      currentRun = 1
    }
  }
  updated.consistency.best_run = bestRun

  return updated
}
