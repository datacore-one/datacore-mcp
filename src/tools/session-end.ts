// src/tools/session-end.ts
// Architecture rule: Session handlers are coordinators.
// They may import leaf handlers (handleInject, handleCapture, handleLearn).
// Leaf handlers must NEVER import session handlers.
import { handleCapture } from './capture.js'
import { handleLearn } from './learn.js'
import { buildHints } from '../hints.js'
import { getConfig } from '../config.js'
import { formatSessionEnd } from '../engagement/format.js'
import type { StorageConfig } from '../storage.js'
import type { EngagementService } from '../engagement/index.js'

interface SessionEndArgs {
  summary: string
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
): Promise<SessionEndResult> {
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
