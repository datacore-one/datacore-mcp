// src/inject.ts
import type { Engram } from './schemas/engram.js'
import type { LoadedPack } from './engrams.js'

export interface InjectionContext {
  prompt: string
  scope?: string
  maxTokens?: number      // Default: 8000 (~10% of 80K context)
  minRelevance?: number   // Default: 0.3
}

export interface InjectionResult {
  directives: Engram[]
  consider: Engram[]
  tokens_used: number
}

interface ScoredEngram {
  engram: Engram
  score: number
}

const DEFAULT_MAX_TOKENS = 8000
const DEFAULT_MIN_RELEVANCE = 0.3
const TOKENS_PER_ENGRAM = 40   // Compact format estimate
const MAX_PER_PACK = 5
const MAX_PER_DOMAIN = 10

export function selectEngrams(
  ctx: InjectionContext,
  personalEngrams: Engram[],
  packs: LoadedPack[],
): InjectionResult {
  const promptLower = ctx.prompt.toLowerCase()
  const promptWords = new Set(promptLower.split(/\W+/).filter(w => w.length > 2))
  const scored: ScoredEngram[] = []

  for (const engram of personalEngrams) {
    if (engram.status !== 'active') continue
    const score = scoreEngram(engram, promptLower, promptWords, [], ctx.scope)
    if (score > 0) scored.push({ engram, score })
  }

  for (const pack of packs) {
    if (pack.manifest['x-datacore'].injection_policy === 'on_request') continue
    const matchTerms = pack.manifest['x-datacore'].match_terms
    for (const engram of pack.engrams) {
      if (engram.status !== 'active') continue
      const score = scoreEngram(engram, promptLower, promptWords, matchTerms, ctx.scope)
      if (score > 0) scored.push({ engram, score })
    }
  }

  const maxTokens = ctx.maxTokens ?? DEFAULT_MAX_TOKENS
  const minRelevance = ctx.minRelevance ?? DEFAULT_MIN_RELEVANCE

  // Filter by minimum relevance
  const passing = scored.filter(s => s.score >= minRelevance)
  passing.sort((a, b) => b.score - a.score)

  // Fill token budget with diversity constraints
  const selected = fillTokenBudget(passing, maxTokens)

  // Split: top 2/3 = directives, bottom 1/3 = consider
  const splitPoint = Math.ceil(selected.length * 2 / 3)
  return {
    directives: selected.slice(0, splitPoint),
    consider: selected.slice(splitPoint),
    tokens_used: selected.length * TOKENS_PER_ENGRAM,
  }
}

function scoreEngram(engram: Engram, promptLower: string, promptWords: Set<string>, packMatchTerms: string[], scopeFilter?: string): number {
  // Scope filtering: if scope is specified, only include matching engrams
  if (scopeFilter) {
    if (scopeFilter === 'global') {
      if (engram.scope !== 'global') return 0
    } else if (!engram.scope.startsWith(scopeFilter) && engram.scope !== 'global') {
      return 0
    }
  }

  let termHits = 0

  // Pack match terms (highest weight — curated relevance signals)
  for (const term of packMatchTerms) {
    if (promptLower.includes(term.toLowerCase())) termHits++
  }
  // Tag matches
  for (const tag of engram.tags) {
    if (promptWords.has(tag.toLowerCase())) termHits++
  }
  // Domain hierarchy matches (each level counts)
  if (engram.domain) {
    for (const part of engram.domain.split(/[./]/)) {
      if (promptWords.has(part.toLowerCase())) termHits++
    }
  }
  // Statement keyword overlap (lower weight)
  const statementLower = engram.statement.toLowerCase()
  for (const word of promptWords) {
    if (statementLower.includes(word)) termHits += 0.5
  }

  if (termHits === 0) return 0

  // Base score from term hits * retrieval strength
  let score = termHits * engram.activation.retrieval_strength

  // Feedback signal boost: positive feedback increases score, negative decreases
  const feedback = engram.feedback_signals
  if (feedback) {
    const netFeedback = feedback.positive - feedback.negative
    if (netFeedback > 0) score *= 1 + Math.min(netFeedback * 0.05, 0.3)
    else if (netFeedback < 0) score *= Math.max(1 + netFeedback * 0.1, 0.5)
  }

  // Consolidated engrams get a slight boost (survived reconsolidation)
  if (engram.consolidated) score *= 1.1

  return score
}

function fillTokenBudget(scored: ScoredEngram[], maxTokens: number): Engram[] {
  const result: Engram[] = []
  const packCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  let tokensUsed = 0

  for (const { engram } of scored) {
    if (tokensUsed + TOKENS_PER_ENGRAM > maxTokens) break

    const pack = engram.pack ?? '__personal__'
    const packCount = packCounts.get(pack) ?? 0
    if (packCount >= MAX_PER_PACK && pack !== '__personal__') continue

    const domain = engram.domain ?? '__none__'
    const topDomain = domain.split('.')[0]
    const domainCount = domainCounts.get(topDomain) ?? 0
    if (domainCount >= MAX_PER_DOMAIN) continue

    result.push(engram)
    tokensUsed += TOKENS_PER_ENGRAM
    packCounts.set(pack, packCount + 1)
    domainCounts.set(topDomain, domainCount + 1)
  }
  return result
}
