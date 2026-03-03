// src/decay.ts

const DECAY_RATE = 0.05
const FLOOR = 0.05
const MS_PER_DAY = 86_400_000

export type EngramState = 'active' | 'fading' | 'dormant' | 'retirement_candidate'

/**
 * Compute decayed retrieval strength using exponential decay.
 * Floor of 0.05 prevents permanent extinction.
 */
export function decayedStrength(
  retrievalStrength: number,
  lastAccessed: string,
  now?: Date,
): number {
  const last = new Date(lastAccessed)
  const current = now ?? new Date()
  const days = Math.max(0, (current.getTime() - last.getTime()) / MS_PER_DAY)
  return Math.max(retrievalStrength * Math.exp(-DECAY_RATE * days), FLOOR)
}

/**
 * Compute decayed co-access association strength.
 * Same exponential pattern as decayedStrength.
 * Returns 0 if below prune threshold (caller should prune).
 */
export function decayedCoAccessStrength(
  strength: number,
  updatedAt: string,
  now?: Date,
  decayRate?: number,
  pruneThreshold?: number,
): number {
  const rate = decayRate ?? DECAY_RATE
  const threshold = pruneThreshold ?? FLOOR
  const last = new Date(updatedAt)
  const current = now ?? new Date()
  const days = Math.max(0, (current.getTime() - last.getTime()) / MS_PER_DAY)
  const decayed = strength * Math.exp(-rate * days)
  return decayed < threshold ? 0 : decayed
}

/**
 * Classify engram state based on current retrieval strength.
 */
export function engramState(retrievalStrength: number): EngramState {
  if (retrievalStrength >= 0.5) return 'active'
  if (retrievalStrength >= 0.3) return 'fading'
  if (retrievalStrength >= 0.1) return 'dormant'
  return 'retirement_candidate'
}
