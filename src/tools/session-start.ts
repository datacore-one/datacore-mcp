// src/tools/session-start.ts
// Architecture rule: Session handlers are coordinators.
// They may import leaf handlers (handleInject, handleCapture, handleLearn).
// Leaf handlers must NEVER import session handlers.
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { handleInject } from './inject-tool.js'
import { loadEngrams } from '../engrams.js'
import { localDate } from './capture.js'
import { buildHints } from '../hints.js'
import {
  expireReconsolidations,
  generateChallenge,
  generateDiscoveryCandidates,
  offerDiscovery,
  checkChallengeCompletion,
  resolveChallenge,
  formatSessionStart,
  formatReconsolidation,
  formatDiscovery,
  formatChallenge,
} from '../engagement/index.js'
import type { StorageConfig } from '../storage.js'
import type { DatacortexBridge } from '../datacortex.js'
import type { EngagementService } from '../engagement/index.js'

interface SessionStartArgs {
  task?: string
  tags?: string[]
}

interface SessionStartResult {
  session_id: string
  engrams: { text: string; count: number } | null
  journal_today: string | null
  pending_candidates: number
  recommendations: string[]
  guide?: string
  engagement?: Record<string, unknown>
  _hints?: ReturnType<typeof buildHints>
}

export async function handleSessionStart(
  args: SessionStartArgs,
  storage: StorageConfig,
  bridge?: DatacortexBridge | null,
  engagementService?: EngagementService,
): Promise<SessionStartResult> {
  const session_id = crypto.randomUUID()
  let engrams: { text: string; count: number } | null = null

  if (args.task) {
    const injectResult = await handleInject(
      { prompt: args.task, session_id, scope: args.tags?.length ? `tags:${args.tags.join(',')}` : undefined },
      { engramsPath: storage.engramsPath, packsPath: storage.packsPath, basePath: storage.basePath },
    )
    if (injectResult.count > 0) {
      engrams = { text: injectResult.text, count: injectResult.count }
    }
  }

  // Read today's journal
  const { date: today } = localDate()
  const journalFile = path.join(storage.journalPath, `${today}.md`)
  const journal_today = fs.existsSync(journalFile)
    ? fs.readFileSync(journalFile, 'utf8')
    : null

  // Count candidate engrams
  const allEngrams = loadEngrams(storage.engramsPath)
  const pending_candidates = allEngrams.filter(e => e.status === 'candidate').length

  // Build recommendations
  const recommendations: string[] = []
  if (pending_candidates > 0) {
    recommendations.push(`${pending_candidates} candidate engram(s) awaiting review. Use datacore.promote to activate.`)
  }
  if (!journal_today) {
    recommendations.push('No journal entry today. Use datacore.capture to start one.')
  }

  const hints = args.task
    ? buildHints({
        next: 'Work on your task. End with datacore.session.end.',
        related: ['datacore.session.end', 'datacore.feedback'],
      })
    : buildHints({
        next: 'No task specified — showing journal and candidates only. Call datacore.inject when ready.',
        related: ['datacore.inject', 'datacore.session.end'],
      })

  // Include the guide when there are no active engrams (fresh install / early usage)
  // so the AI immediately understands how the system works
  const activeCount = allEngrams.filter(e => e.status === 'active').length
  const guide = activeCount === 0 ? SESSION_GUIDE_FULL : SESSION_GUIDE_SHORT

  // Initialize engagement service and run lifecycle hooks
  let engagement: Record<string, unknown> | undefined
  if (engagementService?.isEnabled()) {
    try {
      await engagementService.init()
      engagementService.markSessionActive()

      // Lifecycle: expire overdue reconsolidations
      engagementService.applyProfileUpdate(p => expireReconsolidations(p))

      // Lifecycle: check/complete active challenge
      const profileAfterExpire = engagementService.getProfile()
      if (profileAfterExpire?.challenges.active) {
        if (checkChallengeCompletion(profileAfterExpire, profileAfterExpire.challenges.active)) {
          engagementService.applyProfileUpdate(p => resolveChallenge(p, p.challenges.active!.id))
        }
      }

      // Lifecycle: generate new challenge if none active
      engagementService.applyProfileUpdate(p => generateChallenge(p))

      // Lifecycle: generate discovery candidates (best-effort, no LLM call at session start)
      const profileForDiscovery = engagementService.getProfile()
      if (profileForDiscovery) {
        const candidates = generateDiscoveryCandidates(allEngrams, profileForDiscovery)
        if (candidates.length > 0) {
          // Offer top candidate without LLM evaluation (just keyword overlap)
          const topCandidate = candidates[0]
          engagementService.applyProfileUpdate(p => offerDiscovery(p, {
            engram_a: topCandidate.engram_a,
            engram_b: topCandidate.engram_b,
            connection: `Shared concepts across ${topCandidate.engram_a.domain} and ${topCandidate.engram_b.domain}`,
          }))
        }
      }

      // Build engagement response
      const profile = engagementService.getProfile()
      if (profile) {
        const displayLines: string[] = [formatSessionStart(profile)]

        // Show pending reconsolidations
        for (const recon of profile.reconsolidation.pending.slice(0, 2)) {
          displayLines.push('')
          displayLines.push(formatReconsolidation({
            engram_id: recon.engram_id,
            statement: recon.statement,
            contradiction: recon.contradiction,
            evidence_strength: recon.evidence_strength,
          }))
        }

        // Show pending discoveries
        for (const disc of profile.discoveries.pending.slice(0, 1)) {
          displayLines.push('')
          displayLines.push(formatDiscovery({
            id: disc.id,
            engram_a: disc.engram_a,
            engram_b: disc.engram_b,
            connection: disc.connection,
          }))
        }

        // Show active challenge
        if (profile.challenges.active) {
          displayLines.push('')
          displayLines.push(formatChallenge({
            id: profile.challenges.active.id,
            description: profile.challenges.active.description,
            bonus_xp: profile.challenges.active.bonus_xp,
            expires_at: profile.challenges.active.expires_at,
          }))
        }

        engagement = {
          tier: profile.tier.current,
          xp: profile.xp.total,
          multiplier: profile.multipliers.effective,
          active_challenge: profile.challenges.active ? {
            id: profile.challenges.active.id,
            description: profile.challenges.active.description,
            expires_at: profile.challenges.active.expires_at,
          } : null,
          pending_reconsolidations: profile.reconsolidation.pending.length,
          pending_discoveries: profile.discoveries.pending.length,
          display: displayLines.join('\n'),
        }
      }
    } catch { /* engagement never breaks core tools */ }
  }

  return { session_id, engrams, journal_today, pending_candidates, recommendations, guide, engagement, _hints: hints }
}

// Full guide for fresh installs (no active engrams yet)
const SESSION_GUIDE_FULL = `## Datacore Quick Start

Datacore gives you persistent memory through **engrams** — knowledge that gets injected into context when relevant.

### Use Proactively
- **learn** — call when you discover patterns, preferences, or insights
- **feedback** — rate injected engrams after session.start
- **session.end** — call before conversation ends to capture what was learned

### Session Workflow
1. **session.start** (you just called this) — get context
2. Work on your task. Use **recall** to search everything, **search** for files.
3. **feedback** — rate which injected engrams helped (strengthens useful ones)
4. **session.end** — capture summary + suggest new engrams

### Other Tools
- **capture** — write a journal entry or knowledge note
- **ingest** — import text and extract engram suggestions
- **status** — system health and actionable recommendations
- **forget** — retire an engram you no longer need

### How Engrams Work
learn → active → inject → feedback → stronger/weaker
Positive feedback strengthens engrams. Unused ones naturally decay.`

// Short reminder for returning users
const SESSION_GUIDE_SHORT = `Session started. Workflow: work → feedback → session.end.`
