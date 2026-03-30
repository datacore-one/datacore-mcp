// src/tools/recall.ts
import { getPlur } from '../plur-bridge.js'
import { handleSearch } from './search.js'
import { buildHints } from '../hints.js'
import type { DatacortexBridge } from '../datacortex.js'

interface RecallArgs {
  topic: string
  sources?: ('engrams' | 'journal' | 'knowledge')[]
  limit?: number
}

interface RecallResult {
  engrams?: Array<{ id: string; statement: string; score: number }>
  journal?: Array<{ path: string; snippet: string; score: number }>
  knowledge?: Array<{ path: string; snippet: string; score: number }>
  fallback_warning?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleRecall(
  args: RecallArgs,
  storage: { journalPath: string; knowledgePath: string; spaces?: Array<{ name: string; journalPath: string; knowledgePath: string }> },
  bridge?: DatacortexBridge | null,
): Promise<RecallResult> {
  const sources = args.sources ?? ['engrams', 'journal', 'knowledge']
  const limit = args.limit ?? 10
  const result: RecallResult = {}
  let fallbackWarning: string | undefined

  // Search engrams via PLUR hybrid search
  if (sources.includes('engrams')) {
    const plur = getPlur()
    let engrams: import('@plur-ai/core').Engram[]
    try {
      engrams = await plur.recallHybrid(args.topic, { limit })
    } catch {
      engrams = plur.recall(args.topic, { limit })
    }
    if (engrams.length > 0) {
      result.engrams = engrams.map((e, i) => ({
        id: e.id, statement: e.statement, score: engrams.length - i,
      }))
    }
  }

  // Journal + knowledge search stays in Datacore (unchanged)
  if (sources.includes('journal')) {
    const searchResult = await handleSearch({ query: args.topic, scope: 'journal', limit }, storage, bridge)
    if (searchResult.results.length > 0) {
      result.journal = searchResult.results.map(r => ({ path: r.path, snippet: r.snippet, score: r.score }))
    }
    if (searchResult.fallback_warning) fallbackWarning = searchResult.fallback_warning
  }

  if (sources.includes('knowledge')) {
    const searchResult = await handleSearch({ query: args.topic, scope: 'knowledge', limit }, storage, bridge)
    if (searchResult.results.length > 0) {
      result.knowledge = searchResult.results.map(r => ({ path: r.path, snippet: r.snippet, score: r.score }))
    }
    if (searchResult.fallback_warning) fallbackWarning = searchResult.fallback_warning
  }

  if (fallbackWarning) result.fallback_warning = fallbackWarning

  result._hints = buildHints({
    next: 'Use datacore.feedback on helpful engrams, or datacore.learn to create new ones.',
    related: ['datacore.feedback', 'datacore.learn'],
  })
  return result
}
