// src/tools/learn.ts
import { loadEngrams, saveEngrams } from '../engrams.js'
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
}

function generateEngramId(): string {
  const now = new Date()
  const date = now.toISOString().split('T')[0].replace(/-/g, '').slice(0, 8)
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `ENG-${date.slice(0, 4)}-${date.slice(4)}-${seq}`
}

export async function handleLearn(args: LearnArgs, engramsPath: string): Promise<LearnResult> {
  const engrams = loadEngrams(engramsPath)
  const today = new Date().toISOString().split('T')[0]

  const engram: Engram = {
    id: generateEngramId(),
    version: 2,
    status: 'candidate',
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
      retrieval_strength: 0.5,
      storage_strength: 0.3,
      frequency: 0,
      last_accessed: today,
    },
    pack: null,
    abstract: null,
    derived_from: null,
  }

  engrams.push(engram)
  saveEngrams(engramsPath, engrams)
  return { success: true, engram }
}
