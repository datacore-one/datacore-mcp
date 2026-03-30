// src/tools/session-start.ts
// Architecture rule: Session handlers are coordinators.
// They may import leaf handlers (handleInject, handleCapture, handleLearn).
// Leaf handlers must NEVER import session handlers.
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { handleInject } from './inject-tool.js'
import { localDate } from './capture.js'
import { buildHints } from '../hints.js'
import type { StorageConfig } from '../storage.js'

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
  _hints?: ReturnType<typeof buildHints>
}

export async function handleSessionStart(
  args: SessionStartArgs,
  storage: StorageConfig,
): Promise<SessionStartResult> {
  const session_id = crypto.randomUUID()
  let engrams: { text: string; count: number } | null = null

  if (args.task) {
    const injectResult = await handleInject({
      prompt: args.task,
      scope: args.tags?.length ? `tags:${args.tags.join(',')}` : undefined,
      session_id,
    })
    if (injectResult.count > 0) {
      engrams = { text: injectResult.text, count: injectResult.count }
    }
  }

  // Read today's journal (stays in Datacore)
  const { date: today } = localDate()
  const journalFile = path.join(storage.journalPath, `${today}.md`)
  const journal_today = fs.existsSync(journalFile)
    ? fs.readFileSync(journalFile, 'utf8')
    : null

  const pending_candidates = 0 // PLUR auto-promotes; no candidate state
  const recommendations: string[] = []
  if (!journal_today) {
    recommendations.push('No journal entry today. Use datacore.capture to start one.')
  }

  const guide = engrams ? SESSION_GUIDE_SHORT : SESSION_GUIDE_FULL

  return {
    session_id, engrams, journal_today, pending_candidates, recommendations, guide,
    _hints: buildHints({
      next: args.task
        ? 'Work on your task. End with datacore.session.end.'
        : 'No task specified — call datacore.inject when ready.',
      related: ['datacore.session.end', 'datacore.feedback'],
    }),
  }
}

// Full guide for fresh installs or when no engrams matched
const SESSION_GUIDE_FULL = `## Datacore Quick Start

Datacore gives you persistent memory through **engrams** — knowledge that gets injected into context when relevant.

### Session Workflow
1. **session.start** (you just called this) — get context
2. Work on your task. Use **recall** to search everything.
3. **feedback** — rate which injected engrams helped
4. **session.end** — capture summary + suggest new engrams

### Core Tools
- **learn** — record patterns, preferences, insights
- **recall** — search engrams + journal + knowledge
- **capture** — write a journal entry
- **forget** — retire an outdated engram`

// Short reminder for returning users
const SESSION_GUIDE_SHORT = `Session started. Workflow: work → feedback → session.end.`
