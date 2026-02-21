// src/tools/learn.ts
import { loadEngrams, saveEngrams } from '../engrams.js'
import { getConfig } from '../config.js'
import { buildHints } from '../hints.js'
import type { Engram } from '../schemas/engram.js'

interface LearnArgs {
  statement: string
  type?: 'behavioral' | 'terminological' | 'procedural' | 'architectural'
  scope?: string
  tags?: string[]
  domain?: string
  rationale?: string
  visibility?: 'private' | 'public' | 'template'
}

interface LearnResult {
  success: boolean
  engram: Engram
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

export async function handleLearn(args: LearnArgs, engramsPath: string): Promise<LearnResult> {
  const engrams = loadEngrams(engramsPath)
  const today = new Date().toISOString().split('T')[0]
  const autoPromote = getConfig().engrams.auto_promote

  const engram: Engram = {
    id: generateEngramId(engrams),
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
    tags: args.tags ?? [],
    activation: {
      retrieval_strength: autoPromote ? 0.7 : 0.5,
      storage_strength: autoPromote ? 1.0 : 0.3,
      frequency: 0,
      last_accessed: today,
    },
    pack: null,
    abstract: null,
    derived_from: null,
  }

  engrams.push(engram)
  saveEngrams(engramsPath, engrams)

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

  return { success: true, engram, _hints: hints }
}
