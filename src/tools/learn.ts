// src/tools/learn.ts
import { loadEngrams, saveEngrams } from '../engrams.js'
import { getConfig } from '../config.js'
import { buildHints } from '../hints.js'
import type { Engram } from '../schemas/engram.js'
import type { EngagementService } from '../engagement/index.js'

interface LearnArgs {
  statement: string
  type?: 'behavioral' | 'terminological' | 'procedural' | 'architectural'
  scope?: string
  tags?: string[]
  domain?: string
  rationale?: string
  visibility?: 'private' | 'public' | 'template'
  knowledge_anchors?: Array<{ path: string; relevance?: string; snippet?: string; snippet_extracted_at?: string }>
  dual_coding?: { example?: string; analogy?: string }
  abstract?: string | null
  derived_from?: string | null
}

interface LearnResult {
  success: boolean
  engram: Engram
  xp?: { earned: number; action: string } | null
  _hints?: ReturnType<typeof buildHints>
}

export function generateEngramId(existingEngrams: Engram[]): string {
  const now = new Date()
  const date = now.toISOString().split('T')[0].replace(/-/g, '').slice(0, 8)
  const prefix = `ENG-${date.slice(0, 4)}-${date.slice(4)}-`

  // Find highest seq for today
  let maxSeq = 0
  for (const e of existingEngrams) {
    if (e.id.startsWith(prefix)) {
      const seq = parseInt(e.id.slice(prefix.length), 10)
      if (seq > maxSeq) maxSeq = seq
    }
  }

  const nextSeq = maxSeq + 1
  const padWidth = nextSeq > 999 ? String(nextSeq).length : 3
  return `${prefix}${String(nextSeq).padStart(padWidth, '0')}`
}

export function generateAbstractId(existingEngrams: Engram[]): string {
  const now = new Date()
  const date = now.toISOString().split('T')[0].replace(/-/g, '').slice(0, 8)
  const prefix = `ABS-${date.slice(0, 4)}-${date.slice(4)}-`

  let maxSeq = 0
  for (const e of existingEngrams) {
    if (e.id.startsWith(prefix)) {
      const seq = parseInt(e.id.slice(prefix.length), 10)
      if (seq > maxSeq) maxSeq = seq
    }
  }

  const nextSeq = maxSeq + 1
  const padWidth = nextSeq > 999 ? String(nextSeq).length : 3
  return `${prefix}${String(nextSeq).padStart(padWidth, '0')}`
}

export async function handleLearn(args: LearnArgs, engramsPath: string, service?: EngagementService): Promise<LearnResult> {
  const engrams = loadEngrams(engramsPath)
  const today = new Date().toISOString().split('T')[0]
  const autoPromote = getConfig().engrams.auto_promote

  // Use ABS- prefix for abstract engrams
  const isAbstract = args.abstract !== undefined && args.abstract !== null
  const id = isAbstract ? generateAbstractId(engrams) : generateEngramId(engrams)

  const engram: Engram = {
    id,
    version: 2,
    status: autoPromote ? 'active' : 'candidate',
    consolidated: false,
    type: args.type ?? 'behavioral',
    scope: args.scope ?? 'global',
    visibility: args.visibility ?? 'private',
    statement: args.statement,
    rationale: args.rationale,
    derivation_count: 1,
    domain: args.domain,
    knowledge_anchors: args.knowledge_anchors?.map(a => ({
      path: a.path,
      relevance: (a.relevance as 'primary' | 'supporting' | 'example') ?? 'supporting',
      snippet: a.snippet,
      snippet_extracted_at: a.snippet_extracted_at,
    })) ?? [],
    associations: [],
    dual_coding: args.dual_coding?.example || args.dual_coding?.analogy ? args.dual_coding : undefined,
    tags: args.tags ?? [],
    activation: {
      retrieval_strength: autoPromote ? 0.7 : 0.5,
      storage_strength: autoPromote ? 1.0 : 0.3,
      frequency: 0,
      last_accessed: today,
    },
    pack: null,
    abstract: args.abstract ?? null,
    derived_from: args.derived_from ?? null,
  }

  engrams.push(engram)
  saveEngrams(engramsPath, engrams)

  // Engagement XP
  let xp: LearnResult['xp'] = undefined
  if (service?.isEnabled()) {
    try {
      const isPublic = engram.visibility === 'public' || engram.visibility === 'template'
      const actionKey = isPublic ? 'engram_created_public' : 'engram_created'
      const result = await service.award(actionKey, { visibility: engram.visibility })
      if (result) {
        xp = { earned: result.event.xp_earned, action: actionKey }
      }

      // Check for new domain bonus
      if (engram.domain) {
        const existingDomains = new Set(
          engrams.slice(0, -1).filter(e => e.domain).map(e => e.domain!)
        )
        if (!existingDomains.has(engram.domain)) {
          const domainResult = await service.award('new_domain', { domain: engram.domain })
          if (domainResult && xp) {
            xp.earned += domainResult.event.xp_earned
          }
        }
      }
    } catch { /* engagement never breaks core tools */ }
  }

  const statusLabel = autoPromote ? 'active' : 'candidate'
  const hints = autoPromote
    ? buildHints({
        next: 'Created as active (auto_promote on). Use datacore.inject to retrieve.',
        related: ['datacore.inject'],
        warning: 'Auto-promotion enabled. Engrams are immediately active without review.',
      })
    : buildHints({
        next: 'Created as candidate. Use datacore.promote to activate.',
        related: ['datacore.promote', 'datacore.inject'],
      })

  return { success: true, engram, xp, _hints: hints }
}
