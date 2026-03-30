// src/tools/feedback.ts
import { getPlur } from '../plur-bridge.js'
import { buildHints } from '../hints.js'

type Signal = 'positive' | 'negative' | 'neutral'

interface FeedbackArgs {
  engram_id?: string
  signal?: Signal
  signals?: Array<{ engram_id: string; signal: Signal }>
  comment?: string
}

interface SingleFeedbackResult {
  mode: 'single'
  success: boolean
  engram_id: string
  signal: string
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

interface BatchFeedbackResult {
  mode: 'batch'
  results: Array<{ engram_id: string; signal: string; success: boolean; error?: string }>
  summary: { positive: number; negative: number; neutral: number }
  _hints?: ReturnType<typeof buildHints>
}

export async function handleFeedback(args: FeedbackArgs): Promise<SingleFeedbackResult | BatchFeedbackResult> {
  const plur = getPlur()

  if (args.signals && args.signals.length > 0) {
    const results: BatchFeedbackResult['results'] = []
    const summary = { positive: 0, negative: 0, neutral: 0 }
    for (const { engram_id, signal } of args.signals) {
      try {
        plur.feedback(engram_id, signal)
        results.push({ engram_id, signal, success: true })
        summary[signal]++
      } catch (err) {
        results.push({ engram_id, signal, success: false, error: String(err) })
      }
    }
    return {
      mode: 'batch', results, summary,
      _hints: buildHints({
        next: `Batch feedback recorded: ${summary.positive} positive, ${summary.negative} negative, ${summary.neutral} neutral.`,
        related: ['datacore.session.end', 'datacore.status'],
      }),
    }
  }

  try {
    plur.feedback(args.engram_id!, args.signal!)
    return { mode: 'single', success: true, engram_id: args.engram_id!, signal: args.signal! }
  } catch (err) {
    return {
      mode: 'single', success: false, engram_id: args.engram_id!, signal: args.signal!,
      error: String(err),
      _hints: buildHints({ next: 'Engram not found. Use datacore.recall to find valid IDs.', related: ['datacore.recall'] }),
    }
  }
}
