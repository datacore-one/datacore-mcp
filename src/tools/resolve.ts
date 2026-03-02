// src/tools/resolve.ts
import { loadEngrams, saveEngrams } from '../engrams.js'
import { buildHints } from '../hints.js'
import {
  resolveReconsolidation as resolveRecon,
  resolveDiscovery as resolveDisc,
  dismissChallenge,
  resolveChallenge,
  checkChallengeCompletion,
} from '../engagement/index.js'
import type { EngagementService } from '../engagement/index.js'

interface ResolveArgs {
  type: 'reconsolidation' | 'discovery' | 'challenge'
  id: string
  action: string
  revised_statement?: string
}

interface ResolveResult {
  success: boolean
  type: string
  action: string
  xp_earned?: number
  message?: string
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleResolve(
  args: ResolveArgs,
  engramsPath: string,
  service?: EngagementService,
): Promise<ResolveResult> {
  if (!service?.isEnabled()) {
    return { success: false, type: args.type, action: args.action, error: 'Engagement system is disabled' }
  }

  const profile = service.getProfile()
  if (!profile) {
    return { success: false, type: args.type, action: args.action, error: 'No engagement profile loaded' }
  }

  try {
    switch (args.type) {
      case 'reconsolidation':
        return await handleReconsolidationResolve(args, engramsPath, service)
      case 'discovery':
        return await handleDiscoveryResolve(args, service)
      case 'challenge':
        return handleChallengeResolve(args, service)
      default:
        return { success: false, type: args.type, action: args.action, error: `Unknown resolve type: ${args.type}` }
    }
  } catch (err) {
    return { success: false, type: args.type, action: args.action, error: `${err}` }
  }
}

async function handleReconsolidationResolve(
  args: ResolveArgs,
  engramsPath: string,
  service: EngagementService,
): Promise<ResolveResult> {
  const profile = service.getProfile()!
  const pending = profile.reconsolidation.pending.find(
    r => r.engram_id === args.id || r.contradicting_id === args.id,
  )
  if (!pending) {
    return { success: false, type: 'reconsolidation', action: args.action, error: `No pending reconsolidation for engram ${args.id}` }
  }

  const validActions = ['defend', 'revise', 'retire', 'dismiss']
  if (!validActions.includes(args.action)) {
    return { success: false, type: 'reconsolidation', action: args.action, error: `Invalid action. Must be one of: ${validActions.join(', ')}` }
  }

  if (args.action === 'revise' && !args.revised_statement) {
    return { success: false, type: 'reconsolidation', action: args.action, error: 'revised_statement is required for revise action' }
  }

  // Apply resolution to engrams if needed
  if (args.action === 'revise') {
    const engrams = loadEngrams(engramsPath)
    const engram = engrams.find(e => e.id === args.id)
    if (engram) {
      engram.statement = args.revised_statement!
      saveEngrams(engramsPath, engrams)
    }
  } else if (args.action === 'retire') {
    const engrams = loadEngrams(engramsPath)
    const engram = engrams.find(e => e.id === args.id)
    if (engram) {
      engram.status = 'retired'
      saveEngrams(engramsPath, engrams)
    }
  }

  // Update profile: remove from pending, update stats
  const outcome = args.action as 'defend' | 'revise' | 'retire' | 'dismiss'
  service.applyProfileUpdate(p => resolveRecon(p, args.id, outcome))

  // Award XP via service (for multiplier + eligibility tracking)
  const xpActionMap: Record<string, string> = {
    defend: 'reconsolidation_defend',
    revise: 'reconsolidation_revise',
    retire: 'reconsolidation_retire',
    dismiss: '',
  }

  let xpEarned = 0
  const xpAction = xpActionMap[args.action]
  if (xpAction) {
    const result = await service.award(xpAction, {})
    if (result) xpEarned = result.event.xp_earned
  }

  const messages: Record<string, string> = {
    defend: 'Engram defended — both engrams retained.',
    revise: 'Engram revised with updated statement.',
    retire: 'Old engram retired.',
    dismiss: 'Contradiction dismissed as false positive.',
  }

  return {
    success: true,
    type: 'reconsolidation',
    action: args.action,
    xp_earned: xpEarned,
    message: messages[args.action],
    _hints: buildHints({
      next: xpEarned > 0 ? `+${xpEarned} XP for reconsolidation.` : 'Contradiction dismissed.',
      related: ['datacore.status'],
    }),
  }
}

async function handleDiscoveryResolve(
  args: ResolveArgs,
  service: EngagementService,
): Promise<ResolveResult> {
  const profile = service.getProfile()!
  const pending = profile.discoveries.pending.find(d => d.id === args.id)
  if (!pending) {
    return { success: false, type: 'discovery', action: args.action, error: `No pending discovery ${args.id}` }
  }

  const validActions = ['explore', 'note']
  if (!validActions.includes(args.action)) {
    return { success: false, type: 'discovery', action: args.action, error: `Invalid action. Must be one of: ${validActions.join(', ')}` }
  }

  // Update profile: remove from pending, update stats
  const action = args.action as 'explore' | 'note'
  service.applyProfileUpdate(p => resolveDisc(p, args.id, action))

  // Award XP for explore
  let xpEarned = 0
  if (action === 'explore') {
    const result = await service.award('discovery_explore', {})
    if (result) xpEarned = result.event.xp_earned
  }

  return {
    success: true,
    type: 'discovery',
    action: args.action,
    xp_earned: xpEarned,
    message: action === 'explore' ? 'Discovery explored — synthesis engram created.' : 'Discovery noted.',
    _hints: buildHints({
      next: xpEarned > 0 ? `+${xpEarned} XP for exploring discovery.` : 'Discovery noted for later.',
      related: ['datacore.status'],
    }),
  }
}

function handleChallengeResolve(
  args: ResolveArgs,
  service: EngagementService,
): ResolveResult {
  const profile = service.getProfile()!

  if (!profile.challenges.active || profile.challenges.active.id !== args.id) {
    return { success: false, type: 'challenge', action: args.action, error: `No active challenge with id ${args.id}` }
  }

  if (args.action === 'complete') {
    // Check if challenge is actually completed
    if (!checkChallengeCompletion(profile, profile.challenges.active)) {
      return { success: false, type: 'challenge', action: 'complete', error: 'Challenge criteria not yet met' }
    }
    service.applyProfileUpdate(p => resolveChallenge(p, args.id))
    const bonusXP = profile.challenges.active.bonus_xp
    return {
      success: true,
      type: 'challenge',
      action: 'complete',
      xp_earned: bonusXP,
      message: `Challenge completed! +${bonusXP} bonus XP.`,
      _hints: buildHints({
        next: `+${bonusXP} XP bonus for completing the challenge.`,
        related: ['datacore.status'],
      }),
    }
  }

  if (args.action === 'dismiss') {
    service.applyProfileUpdate(p => dismissChallenge(p, args.id))
    return {
      success: true,
      type: 'challenge',
      action: 'dismiss',
      xp_earned: 0,
      message: 'Challenge dismissed — no penalty.',
      _hints: buildHints({
        next: 'A new challenge will be offered next week.',
        related: ['datacore.status'],
      }),
    }
  }

  return { success: false, type: 'challenge', action: args.action, error: 'Invalid action. Must be "complete" or "dismiss".' }
}
