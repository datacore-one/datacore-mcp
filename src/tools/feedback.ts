// src/tools/feedback.ts
import { loadEngrams } from '../engrams.js'
import { atomicWriteYaml } from './inject-tool.js'
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
  feedback_signals?: { positive: number; negative: number; neutral: number }
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

interface BatchFeedbackResult {
  mode: 'batch'
  results: Array<{ engram_id: string; signal: string; success: boolean; error?: string }>
  summary: { positive: number; negative: number; neutral: number }
  _hints?: ReturnType<typeof buildHints>
}

export async function handleFeedback(
  args: FeedbackArgs,
  engramsPath: string,
): Promise<SingleFeedbackResult | BatchFeedbackResult> {
  // Batch mode
  if (args.signals && args.signals.length > 0) {
    return handleBatchFeedback(args.signals, engramsPath)
  }

  // Single mode (backward compatible)
  return handleSingleFeedback(args.engram_id!, args.signal!, args.comment, engramsPath)
}

async function handleSingleFeedback(
  engram_id: string,
  signal: Signal,
  comment: string | undefined,
  engramsPath: string,
): Promise<SingleFeedbackResult> {
  const engrams = loadEngrams(engramsPath)
  const engram = engrams.find(e => e.id === engram_id)

  if (!engram) {
    return {
      mode: 'single',
      success: false,
      engram_id,
      signal,
      error: `Engram ${engram_id} not found`,
      _hints: buildHints({
        next: 'Engram not found. Use datacore.search or datacore.status to find valid IDs.',
        related: ['datacore.search', 'datacore.status'],
      }),
    }
  }

  const today = new Date().toISOString().split('T')[0]

  if (!engram.feedback_signals) {
    engram.feedback_signals = { positive: 0, negative: 0, neutral: 0 }
  }

  engram.feedback_signals[signal] += 1
  engram.activation.last_accessed = today

  atomicWriteYaml(engramsPath, { engrams })

  return {
    mode: 'single',
    success: true,
    engram_id,
    signal,
    feedback_signals: { ...engram.feedback_signals },
  }
}

async function handleBatchFeedback(
  signals: Array<{ engram_id: string; signal: Signal }>,
  engramsPath: string,
): Promise<BatchFeedbackResult> {
  const engrams = loadEngrams(engramsPath)
  const today = new Date().toISOString().split('T')[0]
  const results: Array<{ engram_id: string; signal: string; success: boolean; error?: string }> = []
  const summary = { positive: 0, negative: 0, neutral: 0 }
  let changed = false

  for (const { engram_id, signal } of signals) {
    const engram = engrams.find(e => e.id === engram_id)
    if (!engram) {
      results.push({ engram_id, signal, success: false, error: `Engram ${engram_id} not found` })
      continue
    }

    if (!engram.feedback_signals) {
      engram.feedback_signals = { positive: 0, negative: 0, neutral: 0 }
    }

    engram.feedback_signals[signal] += 1
    engram.activation.last_accessed = today
    summary[signal]++
    changed = true
    results.push({ engram_id, signal, success: true })
  }

  if (changed) {
    atomicWriteYaml(engramsPath, { engrams })
  }

  return {
    mode: 'batch',
    results,
    summary,
    _hints: buildHints({
      next: `Batch feedback recorded: ${summary.positive} positive, ${summary.negative} negative, ${summary.neutral} neutral.`,
      related: ['datacore.session.end', 'datacore.status'],
    }),
  }
}
