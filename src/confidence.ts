// src/confidence.ts

/**
 * Minimal interface for confidence computation.
 * Accepts any object with these optional fields — works with Engram,
 * AgentEngram, WireEngram, or any subset.
 */
interface ConfidenceInput {
  feedback_signals?: { positive: number; negative: number; neutral: number }
  consolidated?: boolean
}

/**
 * Compute a confidence score (0.0-1.0) from feedback signals.
 *
 * Uses sigmoid of net feedback ratio, dampened by sample size.
 * No feedback → 0.5 (neutral). Heavy positive → approaches 1.0.
 * Small sample sizes are dampened toward 0.5.
 */
export function computeConfidence(input: ConfidenceInput): number {
  const fb = input.feedback_signals ?? { positive: 0, negative: 0, neutral: 0 }
  const total = fb.positive + fb.negative + fb.neutral

  if (total === 0) return 0.5

  // Net ratio: -1.0 (all negative) to +1.0 (all positive)
  const netRatio = (fb.positive - fb.negative) / total

  // Sample-size dampening: adjustedRatio approaches netRatio as total grows
  // At total=1: dampening=0.5, at total=5: dampening=0.83, at total=20: dampening=0.95
  const dampening = 1 - 1 / (total + 1)
  const adjustedRatio = netRatio * dampening

  // Sigmoid: maps [-1,1] to [0,1]
  const steepness = 2.0
  const base = 1 / (1 + Math.exp(-steepness * adjustedRatio))

  // Consolidation bonus
  const consolidationBonus = input.consolidated ? 0.05 : 0

  return Math.min(1.0, Math.max(0.0, base + consolidationBonus))
}
