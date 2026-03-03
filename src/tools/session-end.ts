// src/tools/session-end.ts
// Architecture rule: Session handlers are coordinators.
// They may import leaf handlers (handleInject, handleCapture, handleLearn).
// Leaf handlers must NEVER import session handlers.
import { handleCapture } from './capture.js'
import { handleLearn } from './learn.js'
import { atomicWriteYaml } from './inject-tool.js'
import { buildHints } from '../hints.js'
import { getConfig } from '../config.js'
import { loadEngrams } from '../engrams.js'
import { formatSessionEnd } from '../engagement/format.js'
import type { Engram } from '../schemas/engram.js'
import type { StorageConfig } from '../storage.js'
import type { EngagementService } from '../engagement/index.js'
import type { SessionTracker } from '../session-tracker.js'

interface SessionEndArgs {
  summary: string
  session_id?: string
  tags?: string[]
  engram_suggestions?: Array<{ statement: string; type?: 'behavioral' | 'terminological' | 'procedural' | 'architectural' }>
}

interface SessionEndResult {
  journal_path: string | null
  engrams_created: number
  engagement?: { session_xp: number; total_xp: number; tier: string; display: string }
  _hints?: ReturnType<typeof buildHints>
}

export async function handleSessionEnd(
  args: SessionEndArgs,
  storage: StorageConfig,
  engagementService?: EngagementService,
  tracker?: SessionTracker,
): Promise<SessionEndResult> {
  // Hebbian co-access write-back: strengthen associations between engrams
  // that were injected together in this session
  if (args.session_id && tracker) {
    const pairs = tracker.getCoAccessPairs(args.session_id)
    if (pairs.length > 0) {
      writeCoAccessAssociations(storage.engramsPath, pairs)
    }
    tracker.clear(args.session_id)
  }

  // Capture journal entry
  const captureResult = await handleCapture(
    { type: 'journal', content: args.summary, tags: args.tags },
    storage,
  )

  // Create engrams from suggestions
  let engramsCreated = 0
  if (args.engram_suggestions?.length) {
    for (const suggestion of args.engram_suggestions) {
      await handleLearn(
        { statement: suggestion.statement, type: suggestion.type },
        storage.engramsPath,
        engagementService,
      )
      engramsCreated++
    }
  }

  const autoPromote = getConfig().engrams.auto_promote
  const statusLabel = autoPromote ? 'active' : 'candidates'

  // Flush engagement and get session summary
  let engagement: SessionEndResult['engagement'] = undefined
  if (engagementService?.isEnabled()) {
    try {
      const sessionSummary = engagementService.getSessionSummary()
      await engagementService.flush()
      engagementService.markSessionEnded()
      const profile = engagementService.getProfile()
      engagement = {
        session_xp: sessionSummary.total_xp,
        total_xp: profile?.xp.total ?? 0,
        tier: profile?.tier.current ?? 'Seed',
        display: profile ? formatSessionEnd(profile, sessionSummary.total_xp, sessionSummary.events) : '',
      }
    } catch { /* engagement never breaks core tools */ }
  }

  return {
    journal_path: captureResult.path ?? null,
    engrams_created: engramsCreated,
    engagement,
    _hints: buildHints({
      next: engramsCreated > 0
        ? `Session captured. ${engramsCreated} engram(s) created as ${statusLabel}.`
        : 'Session captured.',
      related: ['datacore.session.start', 'datacore.status'],
    }),
  }
}

// --- Hebbian co-access write-back ---

function writeCoAccessAssociations(
  engramsPath: string,
  pairs: Array<[string, string]>,
): void {
  const engrams = loadEngrams(engramsPath)
  const map = new Map(engrams.map(e => [e.id, e]))
  const config = getConfig().co_access
  let changed = false

  for (const [idA, idB] of pairs) {
    const a = map.get(idA)
    const b = map.get(idB)
    // Only write co-access between personal engrams (not pack engrams)
    if (!a || !b || a.pack || b.pack) continue
    changed = strengthenCoAccess(a, idB, config) || changed
    changed = strengthenCoAccess(b, idA, config) || changed
  }

  if (changed) {
    atomicWriteYaml(engramsPath, { engrams })
  }
}

function strengthenCoAccess(
  engram: Engram,
  targetId: string,
  config: { new_strength: number; increment: number; max_strength: number },
): boolean {
  const today = new Date().toISOString().split('T')[0]
  const existing = engram.associations.find(
    a => a.target === targetId && a.type === 'co_accessed',
  )

  if (existing) {
    const newStrength = Math.min(existing.strength + config.increment, config.max_strength)
    if (newStrength === existing.strength && existing.updated_at === today) return false
    existing.strength = newStrength
    existing.updated_at = today
    return true
  }

  engram.associations.push({
    target_type: 'engram',
    target: targetId,
    strength: config.new_strength,
    type: 'co_accessed',
    updated_at: today,
  })
  return true
}
