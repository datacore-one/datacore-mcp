// src/knowledge-surfacing.ts
// State management for knowledge surfacing: zettel-to-engram and consolidation.
// Per DIP-0019 Phase 4.

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { z } from 'zod'
import { getPlur } from './plur-bridge.js'

// Inline levenshtein distance (was in deleted exchange.ts)
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length
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

// --- Zettel candidate ---

export const ZettelCandidateSchema = z.object({
  path: z.string(),
  title: z.string(),
  suggested_statement: z.string(),
  suggested_type: z.enum(['behavioral', 'terminological', 'procedural', 'architectural']),
  suggested_scope: z.string(),
  suggested_anchors: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  status: z.enum(['pending', 'accepted', 'rejected']),
  created: z.string(),
})

export type ZettelCandidate = z.infer<typeof ZettelCandidateSchema>

// --- Consolidation result ---

export interface ConsolidationResult {
  low_rs_engrams: Array<{ id: string; rs: number; last_accessed: string }>
  duplicate_clusters: Array<{ representative: string; duplicates: string[]; similarity: number }>
  action_taken: 'preview' | 'executed'
  executed_at: string | null
}

// --- State ---

export interface KnowledgeSurfacingState {
  last_zettel_scan: string | null
  scanned_paths: string[]
  zettel_candidates: ZettelCandidate[]
  last_consolidation: string | null
  consolidation_results: ConsolidationResult | null
}

const defaultState: KnowledgeSurfacingState = {
  last_zettel_scan: null,
  scanned_paths: [],
  zettel_candidates: [],
  last_consolidation: null,
  consolidation_results: null,
}

export function loadKnowledgeSurfacing(filePath: string): KnowledgeSurfacingState {
  if (!fs.existsSync(filePath)) return { ...defaultState }
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf8')) as any
    return { ...defaultState, ...raw }
  } catch {
    return { ...defaultState }
  }
}

export function saveKnowledgeSurfacing(filePath: string, state: KnowledgeSurfacingState): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const content = yaml.dump(state, { lineWidth: 120, noRefs: true, quotingType: '"' })
  const tmpPath = filePath + '.tmp.' + process.pid
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, filePath)
}

// --- Zettel scanning ---

const ACTIONABLE_WORDS = /\b(should|always|never|when|before|after|must|avoid|prefer|ensure|make sure)\b/i
const PROCEDURAL_PATTERNS = /(\d+\.\s|\bhow to\b|step \d+)/i
const DECISION_PATTERNS = /\b(because|due to|trade-?off|we chose|decided|rationale)\b/i

export function scanZettels(
  knowledgePath: string,
  state: KnowledgeSurfacingState,
): ZettelCandidate[] {
  const zettelDir = path.join(knowledgePath, 'zettel')
  if (!fs.existsSync(zettelDir)) return []

  const scannedSet = new Set(state.scanned_paths)
  const candidates: ZettelCandidate[] = []
  const today = new Date().toISOString().split('T')[0]

  const files = globMd(zettelDir)
  for (const filePath of files) {
    const relativePath = path.relative(path.dirname(knowledgePath), filePath)
    if (scannedSet.has(relativePath)) continue

    const content = fs.readFileSync(filePath, 'utf8')
    const candidate = analyzeZettel(content, relativePath, today)
    if (candidate) candidates.push(candidate)

    state.scanned_paths.push(relativePath)
  }

  state.last_zettel_scan = today
  return candidates
}

function globMd(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...globMd(full))
    } else if (entry.name.endsWith('.md')) {
      results.push(full)
    }
  }
  return results
}

function analyzeZettel(content: string, relativePath: string, today: string): ZettelCandidate | null {
  const lines = content.split('\n')
  const title = extractTitle(lines) ?? path.basename(relativePath, '.md')

  const hasActionable = ACTIONABLE_WORDS.test(content)
  const hasProcedural = PROCEDURAL_PATTERNS.test(content)
  const hasDecision = DECISION_PATTERNS.test(content)

  // Skip pure factual/definitional content
  if (!hasActionable && !hasProcedural && !hasDecision) return null

  // Determine type
  let type: ZettelCandidate['suggested_type'] = 'behavioral'
  if (hasProcedural) type = 'procedural'
  else if (hasDecision) type = 'architectural'

  // Compute confidence
  let confidence = 0.4
  if (hasActionable) confidence += 0.3
  if (hasProcedural || hasDecision) confidence += 0.1
  confidence = Math.min(confidence, 1.0)

  // Skip low-confidence
  if (confidence < 0.4) return null

  // Extract suggested statement: first actionable sentence or title + first paragraph
  const statement = extractActionableSentence(content) ?? `${title}: ${firstParagraph(content)}`

  return {
    path: relativePath,
    title,
    suggested_statement: statement.slice(0, 300),
    suggested_type: type,
    suggested_scope: 'global',
    suggested_anchors: [relativePath],
    confidence: Math.round(confidence * 100) / 100,
    status: 'pending',
    created: today,
  }
}

function extractTitle(lines: string[]): string | null {
  for (const line of lines) {
    if (line.startsWith('# ')) return line.slice(2).trim()
  }
  return null
}

function extractActionableSentence(content: string): string | null {
  const sentences = content.split(/(?<=[.!?])\s+/)
  for (const sentence of sentences) {
    if (ACTIONABLE_WORDS.test(sentence) && sentence.length > 20) {
      return sentence.replace(/^[-*#>\s]+/, '').trim()
    }
  }
  return null
}

function firstParagraph(content: string): string {
  const lines = content.split('\n')
  const para: string[] = []
  let started = false
  for (const line of lines) {
    if (line.startsWith('#')) continue
    if (line.trim() === '') {
      if (started) break
      continue
    }
    started = true
    para.push(line.trim())
  }
  return para.join(' ').slice(0, 200)
}

// --- Consolidation pass ---

function normalizeStatement(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function consolidationPass(
  engramsPath: string,
  confirm: boolean = false,
): ConsolidationResult {
  const plur = getPlur()
  const engrams = plur.list()
  const active = engrams.filter(e => e.status === 'active' && !e.pack)

  // Low-RS identification
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const lowRs = active.filter(
    e => e.activation.retrieval_strength < 0.15 && e.activation.last_accessed < thirtyDaysAgoStr,
  ).map(e => ({
    id: e.id,
    rs: e.activation.retrieval_strength,
    last_accessed: e.activation.last_accessed,
  }))

  // Duplicate clustering using union-find
  const normalized = active.map(e => ({
    id: e.id,
    norm: normalizeStatement(e.statement),
    rs: e.activation.retrieval_strength,
  }))

  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!
    // Path compression
    let curr = x
    while (curr !== root) {
      const next = parent.get(curr) ?? curr
      parent.set(curr, root)
      curr = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  // Initialize each node as its own parent
  for (const item of normalized) parent.set(item.id, item.id)

  // Compare pairs
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i]
      const b = normalized[j]
      const maxLen = Math.max(a.norm.length, b.norm.length)
      if (maxLen === 0) continue
      const dist = levenshteinDistance(a.norm, b.norm)
      if (dist / maxLen < 0.30) {
        union(a.id, b.id)
      }
    }
  }

  // Build clusters
  const clusters = new Map<string, string[]>()
  for (const item of normalized) {
    const root = find(item.id)
    if (!clusters.has(root)) clusters.set(root, [])
    clusters.get(root)!.push(item.id)
  }

  // Filter to clusters with 2+ members, pick representative (highest RS)
  const duplicateClusters: ConsolidationResult['duplicate_clusters'] = []
  for (const [, members] of clusters) {
    if (members.length < 2) continue
    const sorted = members
      .map(id => ({ id, rs: normalized.find(n => n.id === id)!.rs }))
      .sort((a, b) => b.rs - a.rs)
    duplicateClusters.push({
      representative: sorted[0].id,
      duplicates: sorted.slice(1).map(s => s.id),
      similarity: 0.7, // approximate
    })
  }

  const today = new Date().toISOString().split('T')[0]

  if (confirm) {
    // Execute: retire low-RS and duplicate engrams via PLUR
    const toRetire = new Set([
      ...lowRs.map(e => e.id),
      ...duplicateClusters.flatMap(c => c.duplicates),
    ])

    for (const id of toRetire) {
      plur.forget(id)
    }
  }

  return {
    low_rs_engrams: lowRs,
    duplicate_clusters: duplicateClusters,
    action_taken: confirm ? 'executed' : 'preview',
    executed_at: confirm ? today : null,
  }
}
