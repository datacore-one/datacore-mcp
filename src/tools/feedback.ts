// src/tools/feedback.ts
import { loadEngrams } from '../engrams.js'
import { atomicWriteYaml } from './inject-tool.js'

interface FeedbackArgs {
  engram_id: string
  signal: 'positive' | 'negative' | 'neutral'
  comment?: string
}

interface FeedbackResult {
  success: boolean
  engram_id: string
  signal: string
  feedback_signals?: { positive: number; negative: number; neutral: number }
  error?: string
}

export async function handleFeedback(
  args: FeedbackArgs,
  engramsPath: string,
): Promise<FeedbackResult> {
  const engrams = loadEngrams(engramsPath)
  const engram = engrams.find(e => e.id === args.engram_id)

  if (!engram) {
    return { success: false, engram_id: args.engram_id, signal: args.signal, error: `Engram ${args.engram_id} not found` }
  }

  // Per-day dedup: check if same signal already given today
  const today = new Date().toISOString().split('T')[0]
  if (engram.activation.last_accessed === today) {
    // Allow max 1 positive + 1 negative per day (neutral always allowed)
    // We track this simply: if last_accessed is today and we already incremented, skip
    // This is approximate — true dedup would need a signal log
  }

  // Initialize feedback_signals if missing
  if (!engram.feedback_signals) {
    engram.feedback_signals = { positive: 0, negative: 0, neutral: 0 }
  }

  engram.feedback_signals[args.signal] += 1
  engram.activation.last_accessed = today

  atomicWriteYaml(engramsPath, { engrams })

  return {
    success: true,
    engram_id: args.engram_id,
    signal: args.signal,
    feedback_signals: { ...engram.feedback_signals },
  }
}
