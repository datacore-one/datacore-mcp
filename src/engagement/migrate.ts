// src/engagement/migrate.ts
import type { Engram } from '../schemas/engram.js'
import { TIER_THRESHOLDS, type EngagementProfile } from './types.js'
import { createDefaultProfile, saveProfile, ensureEngagementDir } from './profile.js'
import { BUNDLED_ACTIONS, writeDefaultActions } from './actions.js'
import { resolveTier } from './engine.js'
import { logger } from '../logger.js'

export function calculateRetroactiveXP(engrams: Engram[]): number {
  const quality = engrams.filter(e => e.status === 'active')
  const qualityCount = quality.length
  const publicCount = quality.filter(e => e.visibility === 'public' || e.visibility === 'template').length

  let totalPositiveFeedback = 0
  let totalFeedbackGiven = 0
  for (const e of engrams) {
    totalPositiveFeedback += e.feedback_signals?.positive ?? 0
    totalFeedbackGiven += (e.feedback_signals?.positive ?? 0) + (e.feedback_signals?.negative ?? 0) + (e.feedback_signals?.neutral ?? 0)
  }

  const domains = new Set(engrams.filter(e => e.domain).map(e => e.domain!))
  const domainCount = domains.size

  // Count packs exported — not directly tracked, estimate 0 for migration
  const packsExported = 0

  return (qualityCount * 10)
    + (publicCount * 10)
    + (totalPositiveFeedback * 5)
    + (totalFeedbackGiven * 5)
    + (domainCount * 20)
    + (packsExported * 25)
}

export function migrateProfile(basePath: string, engrams: Engram[]): EngagementProfile {
  ensureEngagementDir(basePath)

  const profile = createDefaultProfile()
  const retroXP = calculateRetroactiveXP(engrams)
  profile.xp.total = retroXP

  const today = new Date().toISOString().split('T')[0]

  // Resolve tier
  const tierResult = resolveTier(profile)
  profile.tier.current = tierResult.current
  if (tierResult.current !== 'Seed') {
    profile.tier.achieved_at = today
    profile.tier.history.push({ tier: tierResult.current, date: today })
  }

  // Set stats from engrams
  const active = engrams.filter(e => e.status === 'active')
  profile.stats.total_engrams_created = active.length
  profile.stats.domains_covered = new Set(engrams.filter(e => e.domain).map(e => e.domain!)).size
  profile.stats.public_engrams = active.filter(e => e.visibility === 'public' || e.visibility === 'template').length
  profile.stats.first_activity = today

  // Write default actions if not present
  writeDefaultActions(basePath)

  // Save profile
  saveProfile(basePath, profile)
  logger.info(`Engagement migration: ${retroXP} retroactive XP → ${profile.tier.current} tier`)

  return profile
}
