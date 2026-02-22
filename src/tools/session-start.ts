// src/tools/session-start.ts
// Architecture rule: Session handlers are coordinators.
// They may import leaf handlers (handleInject, handleCapture, handleLearn).
// Leaf handlers must NEVER import session handlers.
import * as fs from 'fs'
import * as path from 'path'
import { handleInject } from './inject-tool.js'
import { loadEngrams } from '../engrams.js'
import { localDate } from './capture.js'
import { buildHints } from '../hints.js'
import type { StorageConfig } from '../storage.js'
import type { DatacortexBridge } from '../datacortex.js'

interface SessionStartArgs {
  task?: string
  tags?: string[]
}

interface SessionStartResult {
  engrams: { text: string; count: number } | null
  journal_today: string | null
  pending_candidates: number
  recommendations: string[]
  guide?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleSessionStart(
  args: SessionStartArgs,
  storage: StorageConfig,
  bridge?: DatacortexBridge | null,
): Promise<SessionStartResult> {
  let engrams: { text: string; count: number } | null = null

  if (args.task) {
    const injectResult = await handleInject(
      { prompt: args.task, scope: args.tags?.length ? `tags:${args.tags.join(',')}` : undefined },
      { engramsPath: storage.engramsPath, packsPath: storage.packsPath },
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

  return { engrams, journal_today, pending_candidates, recommendations, guide, _hints: hints }
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
