// src/tools/learn.ts
import { getPlur } from '../plur-bridge.js'
import { buildHints } from '../hints.js'
import type { Engram } from '@plur-ai/core'

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
  _hints?: ReturnType<typeof buildHints>
}

export async function handleLearn(args: LearnArgs): Promise<LearnResult> {
  const plur = getPlur()
  const engram = plur.learn(args.statement, {
    type: args.type,
    scope: args.scope,
    domain: args.domain,
    tags: args.tags,
    rationale: args.rationale,
    source: args.rationale ? `rationale: ${args.rationale}` : undefined,
    knowledge_anchors: args.knowledge_anchors,
    dual_coding: args.dual_coding,
    abstract: args.abstract,
    derived_from: args.derived_from,
    visibility: args.visibility,
  })

  return {
    success: true,
    engram,
    _hints: buildHints({
      next: 'Engram created. Use datacore.inject to retrieve it in future sessions.',
      related: ['datacore.inject'],
    }),
  }
}
