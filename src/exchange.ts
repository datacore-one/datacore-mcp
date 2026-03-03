// src/exchange.ts
// LEP (Learning Exchange Packet) creation, validation, and import.
// Per DIP-0019 Phase 4.

import { z } from 'zod'
import type { Engram } from './schemas/engram.js'
import { generateEngramId } from './tools/learn.js'

// --- LEP Packet schema ---

export const LEPEngramSchema = z.object({
  id: z.string(),
  type: z.enum(['behavioral', 'terminological', 'procedural', 'architectural']),
  scope: z.string(),
  statement: z.string(),
  rationale: z.string().optional(),
  domain: z.string().optional(),
  tags: z.array(z.string()).default([]),
  fitness: z.number().min(0).max(1),
  provenance: z.object({
    origin: z.string(),
    chain: z.array(z.string()).default([]),
  }).optional(),
})

export type LEPEngram = z.infer<typeof LEPEngramSchema>

export const LEPPacketSchema = z.object({
  id: z.string(),
  sender: z.string(),
  signature: z.string().nullable().default(null),
  created: z.string(),
  engrams: z.array(LEPEngramSchema),
})

export type LEPPacket = z.infer<typeof LEPPacketSchema>

// --- Fitness calculation ---

export function calculateFitness(engram: Engram, allEngrams: Engram[]): number {
  // adoptionScore = min(log2(adoptionCount + 1) / 6, 1) * envDiversity_norm * 0.4
  const adoptionCount = engram.derivation_count
  const adoptionBase = Math.min(Math.log2(adoptionCount + 1) / 6, 1)

  // envDiversity = distinct scope prefixes across associated engrams
  const associatedScopes = new Set<string>()
  for (const assoc of engram.associations) {
    if (assoc.target_type !== 'engram') continue
    const target = allEngrams.find(e => e.id === assoc.target)
    if (target) {
      const prefix = target.scope.split(':')[0]
      associatedScopes.add(prefix)
    }
  }
  const envDiversity = Math.max(associatedScopes.size, 1)
  const envDiversityNorm = Math.min(envDiversity / 5, 1)
  const adoptionScore = adoptionBase * envDiversityNorm * 0.4

  // rsScore = retrieval_strength * 0.3
  const rsScore = engram.activation.retrieval_strength * 0.3

  // ageScore = min(log(ageDays + 1) / 7, 1) * 0.2
  const createdDate = parseEngramDate(engram.id)
  const ageDays = createdDate
    ? Math.max(0, (Date.now() - createdDate.getTime()) / 86_400_000)
    : 0
  const ageScore = Math.min(Math.log(ageDays + 1) / 7, 1) * 0.2

  // contradictionScore = (1 - contradictionRate) * 0.1
  const feedback = engram.feedback_signals
  const totalFeedback = feedback
    ? feedback.positive + feedback.negative + feedback.neutral
    : 0
  const contradictionRate = totalFeedback > 0 && feedback
    ? feedback.negative / totalFeedback
    : 0
  const contradictionScore = (1 - contradictionRate) * 0.1

  return Math.round((adoptionScore + rsScore + ageScore + contradictionScore) * 1000) / 1000
}

function parseEngramDate(id: string): Date | null {
  // ENG-YYYY-MMDD-NNN → extract date
  const match = id.match(/^ENG-(\d{4})-(\d{4})-/)
  if (!match) return null
  const year = match[1]
  const mmdd = match[2]
  const month = mmdd.slice(0, 2)
  const day = mmdd.slice(2, 4)
  return new Date(`${year}-${month}-${day}`)
}

// --- LEP Packet creation ---

export function createLEPPacket(
  engrams: Engram[],
  allEngrams: Engram[],
  sender: string,
): LEPPacket {
  const today = new Date().toISOString().split('T')[0]
  const id = `LEP-${today.replace(/-/g, '').slice(0, 4)}-${today.replace(/-/g, '').slice(4)}-${String(Date.now()).slice(-3)}`

  const lepEngrams: LEPEngram[] = engrams
    .filter(e => e.visibility === 'public' || e.visibility === 'template')
    .map(e => ({
      id: e.id,
      type: e.type,
      scope: e.scope,
      statement: e.statement,
      rationale: e.rationale,
      domain: e.domain,
      tags: e.tags,
      fitness: calculateFitness(e, allEngrams),
      provenance: {
        origin: sender,
        chain: [id],
      },
    }))

  return { id, sender, signature: null, created: today, engrams: lepEngrams }
}

// --- LEP Packet validation ---

export function validateLEPPacket(raw: unknown): LEPPacket {
  return LEPPacketSchema.parse(raw)
}

// --- Levenshtein distance ---

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

function normalizeStatement(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

// --- LEP Import ---

export interface ImportResult {
  imported: number
  skipped_fitness: number
  skipped_duplicate: number
  skipped_source_cap: boolean
  candidates: Array<{ id: string; statement: string; fitness: number }>
}

export function importLEPEngrams(
  packet: LEPPacket,
  existing: Engram[],
  config: { sourceCapPercent?: number; fitnessThreshold?: number } = {},
): ImportResult {
  const sourceCapPercent = config.sourceCapPercent ?? 0.20
  const fitnessThreshold = config.fitnessThreshold ?? 0.3

  // Source cap check: count engrams from this sender via provenance.origin
  const personalCount = existing.filter(e => !e.pack).length
  if (personalCount > 0) {
    const fromSender = existing.filter(e => e.provenance?.origin === packet.sender).length
    if (fromSender / personalCount > sourceCapPercent) {
      return {
        imported: 0,
        skipped_fitness: 0,
        skipped_duplicate: 0,
        skipped_source_cap: true,
        candidates: [],
      }
    }
  }

  // Normalize existing statements for duplicate detection
  const existingNormalized = existing.map(e => normalizeStatement(e.statement))

  let skippedFitness = 0
  let skippedDuplicate = 0
  const candidates: ImportResult['candidates'] = []

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const trialExpiry = new Date(now)
  trialExpiry.setDate(trialExpiry.getDate() + 30)
  const trialExpiryTag = `_trial_expires:${trialExpiry.toISOString().split('T')[0]}`

  for (const lepEngram of packet.engrams) {
    // Fitness filter
    if (lepEngram.fitness < fitnessThreshold) {
      skippedFitness++
      continue
    }

    // Duplicate detection (Levenshtein, threshold 0.15)
    const normalized = normalizeStatement(lepEngram.statement)
    let isDuplicate = false
    for (const existingNorm of existingNormalized) {
      const dist = levenshteinDistance(normalized, existingNorm)
      const maxLen = Math.max(normalized.length, existingNorm.length)
      if (maxLen > 0 && dist / maxLen < 0.15) {
        isDuplicate = true
        break
      }
    }
    if (isDuplicate) {
      skippedDuplicate++
      continue
    }

    const newId = generateEngramId(existing)
    candidates.push({
      id: newId,
      statement: lepEngram.statement,
      fitness: lepEngram.fitness,
    })

    // Construct new engram as candidate
    const newEngram: Engram = {
      id: newId,
      version: 2,
      status: 'candidate',
      consolidated: false,
      type: lepEngram.type,
      scope: lepEngram.scope,
      visibility: 'private',
      statement: lepEngram.statement,
      rationale: lepEngram.rationale,
      derivation_count: 1,
      domain: lepEngram.domain,
      knowledge_anchors: [],
      associations: [],
      tags: [...lepEngram.tags, '_trial', trialExpiryTag],
      activation: {
        retrieval_strength: 0.5,
        storage_strength: 0.3,
        frequency: 0,
        last_accessed: today,
      },
      pack: packet.id,
      abstract: null,
      derived_from: lepEngram.id,
      provenance: {
        origin: lepEngram.provenance?.origin ?? packet.sender,
        chain: [...(lepEngram.provenance?.chain ?? []), packet.id],
        signature: null,
        license: 'cc-by-sa-4.0',
      },
    }

    existing.push(newEngram)
    existingNormalized.push(normalized)
  }

  return {
    imported: candidates.length,
    skipped_fitness: skippedFitness,
    skipped_duplicate: skippedDuplicate,
    skipped_source_cap: false,
    candidates,
  }
}
