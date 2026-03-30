// src/tools/session-end.ts
// Architecture rule: Session handlers are coordinators.
// They may import leaf handlers (handleInject, handleCapture, handleLearn).
// Leaf handlers must NEVER import session handlers.
import { handleCapture } from './capture.js'
import { handleLearn } from './learn.js'
import { buildHints } from '../hints.js'
import type { StorageConfig } from '../storage.js'

interface SessionEndArgs {
  summary: string
  session_id?: string
  tags?: string[]
  engram_suggestions?: Array<{ statement: string; type?: 'behavioral' | 'terminological' | 'procedural' | 'architectural' }>
}

interface SessionEndResult {
  journal_path: string | null
  engrams_created: number
  _hints?: ReturnType<typeof buildHints>
}

export async function handleSessionEnd(
  args: SessionEndArgs,
  storage: StorageConfig,
): Promise<SessionEndResult> {
  // Hebbian co-access write-back handled by PLUR internally

  // Capture journal entry (stays in Datacore)
  const captureResult = await handleCapture(
    { type: 'journal', content: args.summary, tags: args.tags },
    storage,
  )

  // Create engrams from suggestions via PLUR
  let engramsCreated = 0
  if (args.engram_suggestions?.length) {
    for (const suggestion of args.engram_suggestions) {
      await handleLearn({ statement: suggestion.statement, type: suggestion.type })
      engramsCreated++
    }
  }

  return {
    journal_path: captureResult.path ?? null,
    engrams_created: engramsCreated,
    _hints: buildHints({
      next: engramsCreated > 0
        ? `Session captured. ${engramsCreated} engram(s) created.`
        : 'Session captured.',
      related: ['datacore.session.start', 'datacore.status'],
    }),
  }
}
