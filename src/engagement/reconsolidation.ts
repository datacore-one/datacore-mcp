// src/engagement/reconsolidation.ts — contradiction detection and resolution
import type { EngagementProfile, ReconsolidationPending } from './types.js'
import type { Engram } from '../schemas/engram.js'

// === Interfaces ===

export interface DetectedContradiction {
  engram_id: string
  contradicting_id: string
  statement: string
  contradiction: string
  evidence_strength: 'weak' | 'moderate' | 'strong'
  confidence: number
}

// === Constants ===

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'it', 'its', 'in', 'on',
  'at', 'to', 'for', 'of', 'by', 'with',
])

const OPPOSITION_PAIRS: Array<[string, string]> = [
  ['always', 'never'],
  ['prefer', 'avoid'],
  ['use', "don't use"],
  ['should', 'should not'],
  ['must', 'must not'],
  ['enable', 'disable'],
  ['with', 'without'],
  ['recommended', 'discouraged'],
  ['best', 'worst'],
  ['important', 'unnecessary'],
]

const EXPIRY_DAYS = 7
const CONFIDENCE_THRESHOLD = 0.5

// === Tokenization ===

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/\s+|[.,;:!?()[\]{}]/)
    .filter(t => t.length > 0 && !STOPWORDS.has(t))
  return new Set(tokens)
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)))
  const union = new Set([...a, ...b])
  if (union.size === 0) return 0
  return intersection.size / union.size
}

function countOppositionPairs(textA: string, textB: string): number {
  const lowerA = textA.toLowerCase()
  const lowerB = textB.toLowerCase()
  let count = 0

  for (const [termA, termB] of OPPOSITION_PAIRS) {
    if (
      (lowerA.includes(termA) && lowerB.includes(termB)) ||
      (lowerA.includes(termB) && lowerB.includes(termA))
    ) {
      count++
    }
  }

  return count
}

// === Core functions ===

export function detectContradiction(
  newEngram: Engram,
  existingEngrams: Engram[],
): DetectedContradiction | null {
  if (!newEngram.domain) return null

  const newTokens = tokenize(newEngram.statement)

  for (const existing of existingEngrams) {
    // Skip self
    if (existing.id === newEngram.id) continue
    // Domain-scoped: only compare within same domain
    if (existing.domain !== newEngram.domain) continue
    // Skip retired
    if (existing.status === 'retired') continue

    const existingTokens = tokenize(existing.statement)
    const similarity = jaccardSimilarity(newTokens, existingTokens)

    // Jaccard threshold
    if (similarity <= 0.3) continue

    // Must have at least one opposition pair
    const oppositionCount = countOppositionPairs(newEngram.statement, existing.statement)
    if (oppositionCount === 0) continue

    // Evidence strength
    let evidence_strength: 'weak' | 'moderate' | 'strong'
    if (similarity > 0.6) {
      evidence_strength = 'strong'
    } else if (similarity > 0.4) {
      evidence_strength = 'moderate'
    } else {
      evidence_strength = 'weak'
    }

    // Confidence: similarity * (1 + opposition_pair_count * 0.2), capped at 1.0
    const confidence = Math.min(1.0, similarity * (1 + oppositionCount * 0.2))

    // Only surface when confidence >= threshold
    if (confidence < CONFIDENCE_THRESHOLD) continue

    return {
      engram_id: newEngram.id,
      contradicting_id: existing.id,
      statement: newEngram.statement,
      contradiction: existing.statement,
      evidence_strength,
      confidence,
    }
  }

  return null
}

export function queueReconsolidation(
  profile: EngagementProfile,
  contradiction: DetectedContradiction,
): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  const pending: ReconsolidationPending = {
    engram_id: contradiction.engram_id,
    contradicting_id: contradiction.contradicting_id,
    statement: contradiction.statement,
    contradiction: contradiction.contradiction,
    evidence_strength: contradiction.evidence_strength,
    confidence: contradiction.confidence,
    detected_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  }

  updated.reconsolidation.pending.push(pending)
  return updated
}

export function resolveReconsolidation(
  profile: EngagementProfile,
  engramId: string,
  outcome: 'defend' | 'revise' | 'retire' | 'dismiss',
): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))

  // Find and remove from pending
  const idx = updated.reconsolidation.pending.findIndex(
    p => p.engram_id === engramId || p.contradicting_id === engramId,
  )
  if (idx === -1) return updated

  updated.reconsolidation.pending.splice(idx, 1)
  updated.reconsolidation.total_resolved++

  // Note: XP is handled by the caller via service.award(), not here.
  // This function only manages state transitions.

  // Track outcome
  if (outcome === 'defend') updated.reconsolidation.outcomes.defended++
  else if (outcome === 'revise') updated.reconsolidation.outcomes.revised++
  else if (outcome === 'retire') updated.reconsolidation.outcomes.retired++
  else if (outcome === 'dismiss') updated.reconsolidation.outcomes.dismissed++

  // Update response rate
  const totalOutcomes =
    updated.reconsolidation.outcomes.defended +
    updated.reconsolidation.outcomes.revised +
    updated.reconsolidation.outcomes.retired
  const totalAll = totalOutcomes + updated.reconsolidation.outcomes.dismissed
  updated.reconsolidation.response_rate = totalAll > 0 ? totalOutcomes / totalAll : 0

  return updated
}

export function expireReconsolidations(profile: EngagementProfile): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  const now = new Date().toISOString()

  const expired: ReconsolidationPending[] = []
  const remaining: ReconsolidationPending[] = []

  for (const pending of updated.reconsolidation.pending) {
    if (pending.expires_at <= now) {
      expired.push(pending)
    } else {
      remaining.push(pending)
    }
  }

  if (expired.length === 0) return updated

  updated.reconsolidation.pending = remaining

  // Auto-retire overdue: 3XP each
  for (const _entry of expired) {
    updated.xp.total += 3
    updated.reconsolidation.total_resolved++
    updated.reconsolidation.outcomes.retired++
  }

  // Update response rate
  const totalOutcomes =
    updated.reconsolidation.outcomes.defended +
    updated.reconsolidation.outcomes.revised +
    updated.reconsolidation.outcomes.retired
  const totalAll = totalOutcomes + updated.reconsolidation.outcomes.dismissed
  updated.reconsolidation.response_rate = totalAll > 0 ? totalOutcomes / totalAll : 0

  return updated
}
