// src/engagement/format.ts
import { TIER_THRESHOLDS, type EngagementProfile, type XPEvent } from './types.js'

export function formatSessionStart(profile: EngagementProfile): string {
  const tier = profile.tier.current
  const xp = profile.xp.total
  const nextTier = TIER_THRESHOLDS.find(t => t.minXP > xp)
  const xpToNext = nextTier ? nextTier.minXP - xp : 0
  const nextLabel = nextTier ? ` → ${nextTier.name} in ${xpToNext} XP` : ' (max tier)'

  const multiplierLabel = profile.multipliers.effective > 1.0
    ? ` [${profile.multipliers.effective}x ${profile.multipliers.active.map(m => m.type).join(', ')}]`
    : ''

  const lines: string[] = []
  lines.push(`Your Datacore: ${tier} (${xp.toLocaleString()} XP${nextLabel})${multiplierLabel}`)

  // AI performance line
  if (profile.ai_performance.feedback_count > 0) {
    const helpful = Math.round(profile.ai_performance.helpful_ratio * 100)
    lines.push(`  AI surfaced ${profile.ai_performance.total_injections} insights this week (${helpful}% helpful)`)
  }

  // Consistency + exchange readiness
  const activeDays = profile.consistency.active_days_30
  lines.push(`  Active ${activeDays}/30 days`)

  return lines.join('\n')
}

export function formatSessionEnd(profile: EngagementProfile, sessionXP: number, events: XPEvent[]): string {
  if (sessionXP === 0) return 'Session complete — no XP earned this session.'

  const multiplierLabel = profile.multipliers.effective > 1.0
    ? ` (×${profile.multipliers.effective} ${profile.multipliers.active.map(m => m.type).join(', ')})`
    : ''

  // Find dominant domain from events
  const domainActions = events.filter(e => e.context?.domain).map(e => e.context!.domain as string)
  const domainNote = domainActions.length > 0 ? ` | Your ${domainActions[0]} domain deepened` : ''

  const lines: string[] = []
  lines.push(`Session: +${sessionXP} XP${multiplierLabel}${domainNote}`)

  const candidates = 0 // placeholder — would need external data
  if (candidates > 0) {
    lines.push(`Tomorrow: ${candidates} candidate(s) ready for review`)
  }

  return lines.join('\n')
}

export function formatStatus(profile: EngagementProfile): string {
  const lines: string[] = []

  // Header
  lines.push('## Engagement Dashboard')
  lines.push('')

  // Tier + XP
  const nextTier = TIER_THRESHOLDS.find(t => t.minXP > profile.xp.total)
  const progress = nextTier
    ? `${profile.xp.total}/${nextTier.minXP} XP (${Math.round((profile.xp.total / nextTier.minXP) * 100)}%)`
    : `${profile.xp.total} XP (max tier)`
  lines.push(`**Tier:** ${profile.tier.current} — ${progress}`)
  lines.push(`**This week:** ${profile.xp.this_week} XP`)

  // Multipliers
  if (profile.multipliers.active.length > 0) {
    const mults = profile.multipliers.active.map(m => `${m.type} (${m.factor}x)`).join(', ')
    lines.push(`**Multipliers:** ${mults} = ${profile.multipliers.effective}x`)
  }

  // Consistency
  lines.push(`**Consistency:** ${profile.consistency.active_days_30}/30 days active, best run: ${profile.consistency.best_run} days`)

  // Stats
  lines.push('')
  lines.push('**Stats:**')
  lines.push(`- Engrams created: ${profile.stats.total_engrams_created}`)
  lines.push(`- Feedback given: ${profile.stats.total_feedback_given}`)
  lines.push(`- Domains covered: ${profile.stats.domains_covered}`)
  lines.push(`- Packs exported: ${profile.stats.total_packs_exported}`)

  // Active challenge
  if (profile.challenges.active) {
    lines.push('')
    lines.push(`**Active Challenge:** ${profile.challenges.active.description}`)
    lines.push(`  Expires: ${profile.challenges.active.expires_at}`)
  }

  // Pending reconsolidations
  if (profile.reconsolidation.pending.length > 0) {
    lines.push('')
    lines.push(`**Pending Contradictions:** ${profile.reconsolidation.pending.length}`)
  }

  // Reputation
  if (profile.reputation.score > 0) {
    lines.push('')
    lines.push(`**Reputation:** ${profile.reputation.score.toFixed(2)}`)
  }

  return lines.join('\n')
}

export function formatTierUp(from: string, to: string): string {
  return `🎯 Tier Up! ${from} → ${to}`
}

export function formatReconsolidation(recon: {
  engram_id: string
  statement: string
  contradiction: string
  evidence_strength: string
}): string {
  const lines: string[] = []
  lines.push('**Contradiction Detected:**')
  lines.push(`  Existing: "${recon.statement}"`)
  lines.push(`  New: "${recon.contradiction}"`)
  lines.push(`  Evidence: ${recon.evidence_strength}`)
  lines.push('')
  lines.push('  Actions: [Defend] [Revise] [Retire] [Dismiss]')
  lines.push(`  → Use datacore.resolve with type="reconsolidation", id="${recon.engram_id}"`)
  return lines.join('\n')
}

export function formatDiscovery(disc: {
  id: string
  engram_a: { statement: string; domain: string }
  engram_b: { statement: string; domain: string }
  connection: string
}): string {
  const lines: string[] = []
  lines.push('**Cross-Domain Discovery:**')
  lines.push(`  "${disc.engram_a.statement}" (${disc.engram_a.domain})`)
  lines.push(`  ↔ "${disc.engram_b.statement}" (${disc.engram_b.domain})`)
  lines.push(`  Connection: ${disc.connection}`)
  lines.push('')
  lines.push('  Actions: [Explore +20 XP] [Note]')
  lines.push(`  → Use datacore.resolve with type="discovery", id="${disc.id}"`)
  return lines.join('\n')
}

export function formatChallenge(challenge: {
  id: string
  description: string
  bonus_xp: number
  expires_at: string
}): string {
  const lines: string[] = []
  lines.push(`**Weekly Challenge:** ${challenge.description}`)
  lines.push(`  Bonus: +${challenge.bonus_xp} XP | Expires: ${challenge.expires_at}`)
  lines.push(`  → Dismiss: datacore.resolve with type="challenge", id="${challenge.id}", action="dismiss"`)
  return lines.join('\n')
}

export function formatGettingStartedGraduation(): string {
  return 'Your Datacore has enough depth for real challenges now. Weekly challenges unlocked.'
}
