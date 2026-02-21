// src/tools/recall.ts
import { loadEngrams } from '../engrams.js'
import { handleSearch } from './search.js'
import { buildHints } from '../hints.js'
import type { DatacortexBridge } from '../datacortex.js'

interface RecallArgs {
  topic: string
  sources?: ('engrams' | 'journal' | 'knowledge')[]
  limit?: number
}

interface EngramResult {
  id: string
  statement: string
  score: number
}

interface FileResult {
  path: string
  snippet: string
  title?: string
  date?: string
  score: number
}

interface RecallResult {
  engrams?: EngramResult[]
  journal?: FileResult[]
  knowledge?: FileResult[]
  fallback_warning?: string
  _hints?: ReturnType<typeof buildHints>
}

export async function handleRecall(
  args: RecallArgs,
  storage: { engramsPath: string; journalPath: string; knowledgePath: string },
  bridge?: DatacortexBridge | null,
): Promise<RecallResult> {
  const sources = args.sources ?? ['engrams', 'journal', 'knowledge']
  const limit = args.limit ?? 10
  const result: RecallResult = {}
  let fallbackWarning: string | undefined

  // Search engrams by keyword overlap
  if (sources.includes('engrams')) {
    const engrams = loadEngrams(storage.engramsPath)
    const topicWords = args.topic.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const scored: EngramResult[] = []

    for (const e of engrams) {
      if (e.status === 'retired') continue
      const text = `${e.statement} ${e.tags.join(' ')}`.toLowerCase()
      let score = 0
      for (const word of topicWords) {
        if (text.includes(word)) score++
      }
      if (score > 0) {
        scored.push({ id: e.id, statement: e.statement, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    const engramResults = scored.slice(0, limit)
    if (engramResults.length > 0) {
      result.engrams = engramResults
    }
  }

  // Search journal
  if (sources.includes('journal')) {
    const searchResult = await handleSearch(
      { query: args.topic, scope: 'journal', limit },
      { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath },
      bridge,
    )
    if (searchResult.results.length > 0) {
      result.journal = searchResult.results.map(r => ({
        path: r.path,
        snippet: r.snippet,
        title: (r as any).title,
        date: (r as any).date,
        score: r.score,
      }))
    }
    if (searchResult.fallback_warning) {
      fallbackWarning = searchResult.fallback_warning
    }
  }

  // Search knowledge
  if (sources.includes('knowledge')) {
    const searchResult = await handleSearch(
      { query: args.topic, scope: 'knowledge', limit },
      { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath },
      bridge,
    )
    if (searchResult.results.length > 0) {
      result.knowledge = searchResult.results.map(r => ({
        path: r.path,
        snippet: r.snippet,
        title: (r as any).title,
        date: (r as any).date,
        score: r.score,
      }))
    }
    if (searchResult.fallback_warning) {
      fallbackWarning = searchResult.fallback_warning
    }
  }

  if (fallbackWarning) {
    result.fallback_warning = fallbackWarning
  }

  result._hints = buildHints({
    next: 'Use datacore.feedback on helpful engrams, or datacore.learn to create new ones.',
    related: ['datacore.feedback', 'datacore.learn'],
  })

  return result
}
