// src/engagement/discovery.ts — cross-domain discovery
import type { EngagementProfile, Discovery } from './types.js'
import type { Engram } from '../schemas/engram.js'

// === Interfaces ===

export interface DiscoveryCandidate {
  engram_a: { id: string; domain: string; statement: string }
  engram_b: { id: string; domain: string; statement: string }
  overlap_size: number
}

export interface EvaluatedDiscovery {
  engram_a: { id: string; domain: string; statement: string }
  engram_b: { id: string; domain: string; statement: string }
  connection: string
}

// === Constants ===

const MIN_ENGRAMS = 20
const MIN_DOMAINS = 3
const MIN_DAYS_BETWEEN_DISCOVERIES = 2
const LLM_TIMEOUT_MS = 5000

// === Helpers ===

function extractKeywords(statement: string): Set<string> {
  const stopwords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'it', 'its', 'in', 'on',
    'at', 'to', 'for', 'of', 'by', 'with',
  ])
  const tokens = statement
    .toLowerCase()
    .split(/\s+|[.,;:!?()[\]{}]/)
    .filter(t => t.length > 0 && !stopwords.has(t))
  return new Set(tokens)
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA)
  const b = new Date(dateB)
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

// === Core functions ===

export function generateDiscoveryCandidates(
  engrams: Engram[],
  profile: EngagementProfile,
): DiscoveryCandidate[] {
  // Guard: minimum engrams
  if (engrams.length < MIN_ENGRAMS) return []

  // Guard: minimum domains
  const domains = new Set(engrams.map(e => e.domain).filter(Boolean))
  if (domains.size < MIN_DOMAINS) return []

  // Guard: cooldown between discoveries
  if (profile.discoveries.last_offered) {
    const daysSinceLast = daysBetween(
      profile.discoveries.last_offered,
      new Date().toISOString(),
    )
    if (daysSinceLast < MIN_DAYS_BETWEEN_DISCOVERIES) return []
  }

  // Only consider active engrams with domains
  const withDomains = engrams.filter(
    e => e.domain && e.status === 'active',
  )

  // Pre-compute keyword sets
  const keywordMap = new Map<string, Set<string>>()
  for (const e of withDomains) {
    keywordMap.set(e.id, extractKeywords(e.statement))
  }

  // Find cross-domain pairs with keyword overlap
  const candidates: DiscoveryCandidate[] = []
  const seen = new Set<string>()

  for (let i = 0; i < withDomains.length; i++) {
    for (let j = i + 1; j < withDomains.length; j++) {
      const a = withDomains[i]
      const b = withDomains[j]

      // Cross-domain only
      if (a.domain === b.domain) continue

      // Deduplicate pair
      const pairKey = [a.id, b.id].sort().join(':')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      // Compute keyword intersection
      const kwA = keywordMap.get(a.id)!
      const kwB = keywordMap.get(b.id)!
      const intersection = new Set([...kwA].filter(x => kwB.has(x)))

      if (intersection.size === 0) continue

      candidates.push({
        engram_a: { id: a.id, domain: a.domain!, statement: a.statement },
        engram_b: { id: b.id, domain: b.domain!, statement: b.statement },
        overlap_size: intersection.size,
      })
    }
  }

  // Rank by intersection size (descending)
  candidates.sort((a, b) => b.overlap_size - a.overlap_size)

  return candidates
}

export async function evaluateDiscovery(
  candidate: DiscoveryCandidate,
  llmCall: (prompt: string) => Promise<string>,
): Promise<EvaluatedDiscovery | null> {
  const prompt = `These two knowledge items are from different domains. Is there a meaningful structural connection? If yes, describe it in one sentence. If no, respond 'none'. Item A: ${candidate.engram_a.statement} (domain: ${candidate.engram_a.domain}). Item B: ${candidate.engram_b.statement} (domain: ${candidate.engram_b.domain}).`

  try {
    const result = await Promise.race([
      llmCall(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS),
      ),
    ])

    const trimmed = result.trim().toLowerCase()
    if (trimmed === 'none' || trimmed === '') return null

    return {
      engram_a: candidate.engram_a,
      engram_b: candidate.engram_b,
      connection: result.trim(),
    }
  } catch {
    // Timeout or LLM error — return null
    return null
  }
}

export function offerDiscovery(
  profile: EngagementProfile,
  discovery: EvaluatedDiscovery,
): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))
  const now = new Date().toISOString()

  const id = `disc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const entry: Discovery = {
    id,
    engram_a: discovery.engram_a,
    engram_b: discovery.engram_b,
    connection: discovery.connection,
    offered_at: now,
  }

  updated.discoveries.pending.push(entry)
  updated.discoveries.total++
  updated.discoveries.last_offered = now

  return updated
}

export function resolveDiscovery(
  profile: EngagementProfile,
  discoveryId: string,
  action: 'explore' | 'note',
): EngagementProfile {
  const updated: EngagementProfile = JSON.parse(JSON.stringify(profile))

  // Find and remove from pending
  const idx = updated.discoveries.pending.findIndex(d => d.id === discoveryId)
  if (idx === -1) return updated

  updated.discoveries.pending.splice(idx, 1)

  // Note: XP is handled by the caller via service.award(), not here.
  // This function only manages state transitions.
  if (action === 'explore') {
    updated.discoveries.explored++
  } else {
    updated.discoveries.noted++
  }

  // Update explore rate
  const totalResolved = updated.discoveries.explored + updated.discoveries.noted
  updated.discoveries.explore_rate =
    totalResolved > 0 ? updated.discoveries.explored / totalResolved : 0

  return updated
}
