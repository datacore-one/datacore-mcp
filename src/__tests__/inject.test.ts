import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  estimateTokens,
  anchorBoost,
  flattenRelations,
  fillTokenBudget,
  aggregateAnchors,
  selectAndSpread,
  scoreEngram,
  type ScoredEngram,
  type AgentEngram,
} from '../inject.js'
import type { Engram, KnowledgeAnchor, Association } from '../schemas/engram.js'
import type { SchemaDefinition } from '../schemas/schema-definition.js'

// Mock config — must be before any imports that call getConfig
vi.mock('../config.js', () => ({
  getConfig: () => ({
    version: 2,
    engrams: { auto_promote: true },
    packs: { trusted_publishers: [] },
    search: { max_results: 20, snippet_length: 500 },
    hints: { enabled: true },
    engagement: { enabled: false, inline_xp: false },
    injection: {
      directive_cap: 10,
      consider_cap: 5,
      spread_cap: 3,
      spread_budget: 480,
    },
  }),
}))

const today = new Date().toISOString().split('T')[0]

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  return {
    id: `ENG-${today.replace(/-/g, '').slice(0, 4)}-${today.replace(/-/g, '').slice(4)}-001`,
    version: 2,
    status: 'active',
    consolidated: false,
    type: 'behavioral',
    scope: 'global',
    visibility: 'private',
    statement: 'Test engram statement',
    derivation_count: 1,
    knowledge_anchors: [],
    associations: [],
    tags: [],
    activation: {
      retrieval_strength: 0.7,
      storage_strength: 1.0,
      frequency: 0,
      last_accessed: today,
    },
    pack: null,
    abstract: null,
    derived_from: null,
    ...overrides,
  }
}

function makeScoredEngram(overrides: Partial<Engram> = {}, score = 5): ScoredEngram {
  return {
    ...makeEngram(overrides),
    keyword_match: score,
    raw_score: score,
    score,
  }
}

// --- estimateTokens ---

describe('estimateTokens', () => {
  it('estimates reasonable tokens for a basic engram', () => {
    const engram = makeScoredEngram({ statement: 'Short statement' })
    const tokens = estimateTokens(engram)
    expect(tokens).toBeGreaterThan(20)
    expect(tokens).toBeLessThan(150)
  })

  it('estimates more tokens for enriched engram', () => {
    const basic = makeScoredEngram({ statement: 'Short' })
    const enriched = makeScoredEngram({
      statement: 'This is a much longer statement with detailed information about the topic at hand',
      rationale: 'Because this pattern consistently improves code quality across multiple projects',
      knowledge_anchors: [
        { path: 'zettel/Data-Pricing.md', relevance: 'primary', snippet: 'The 3-tier pricing model includes raw, enriched, and premium data feeds' },
        { path: 'literature/Fund-Tokenization.md', relevance: 'supporting' },
      ],
      dual_coding: { example: 'When processing API responses, always validate schema first', analogy: 'Like a customs checkpoint for data' },
      tags: ['architecture', 'data', 'validation'],
      domain: 'software.architecture',
    })
    const basicTokens = estimateTokens(basic)
    const enrichedTokens = estimateTokens(enriched)
    expect(enrichedTokens).toBeGreaterThan(basicTokens * 2)
  })

  it('excludes scoring fields from token count', () => {
    const engram = makeScoredEngram({}, 100)
    const tokens = estimateTokens(engram)
    // Should be same regardless of score values
    const engram2 = makeScoredEngram({}, 1)
    const tokens2 = estimateTokens(engram2)
    expect(tokens).toBe(tokens2)
  })
})

// --- anchorBoost ---

describe('anchorBoost', () => {
  it('returns 0 for engrams without anchors', () => {
    const engram = makeEngram()
    const taskWords = new Set(['test', 'engram'])
    expect(anchorBoost(engram, taskWords)).toBe(0)
  })

  it('returns 0 when snippet words do not overlap with task', () => {
    const engram = makeEngram({
      knowledge_anchors: [
        { path: 'test.md', relevance: 'primary', snippet: 'completely unrelated words here' },
      ],
    })
    const taskWords = new Set(['python', 'architecture'])
    expect(anchorBoost(engram, taskWords)).toBe(0)
  })

  it('returns 0.5 for one matching anchor', () => {
    const engram = makeEngram({
      knowledge_anchors: [
        { path: 'test.md', relevance: 'primary', snippet: 'python architecture patterns for data processing' },
      ],
    })
    const taskWords = new Set(['python', 'architecture'])
    expect(anchorBoost(engram, taskWords)).toBe(0.5)
  })

  it('caps at 2.0 for many matching anchors', () => {
    const engram = makeEngram({
      knowledge_anchors: [
        { path: 'a.md', relevance: 'primary', snippet: 'python architecture design' },
        { path: 'b.md', relevance: 'supporting', snippet: 'python patterns architecture' },
        { path: 'c.md', relevance: 'example', snippet: 'architecture python examples' },
        { path: 'd.md', relevance: 'supporting', snippet: 'python architecture best practices' },
        { path: 'e.md', relevance: 'supporting', snippet: 'architecture python deployment' },
      ],
    })
    const taskWords = new Set(['python', 'architecture'])
    expect(anchorBoost(engram, taskWords)).toBe(2.0)
  })

  it('uses threshold 1 when taskWords has only 1 word', () => {
    const engram = makeEngram({
      knowledge_anchors: [
        { path: 'test.md', relevance: 'primary', snippet: 'python is a great language' },
      ],
    })
    const taskWords = new Set(['python'])
    expect(anchorBoost(engram, taskWords)).toBe(0.5)
  })

  it('skips anchors without snippets', () => {
    const engram = makeEngram({
      knowledge_anchors: [
        { path: 'test.md', relevance: 'primary' },
      ],
    })
    const taskWords = new Set(['python', 'architecture'])
    expect(anchorBoost(engram, taskWords)).toBe(0)
  })
})

// --- flattenRelations ---

describe('flattenRelations', () => {
  it('returns empty array when no relations', () => {
    const engram = makeEngram()
    expect(flattenRelations(engram)).toEqual([])
  })

  it('converts relations to associations correctly', () => {
    const engram = makeEngram({
      relations: {
        broader: ['ENG-2026-0301-001'],
        narrower: ['ENG-2026-0301-002'],
        related: ['ENG-2026-0301-003'],
        conflicts: ['ENG-2026-0301-004'],
      },
    })
    const result = flattenRelations(engram)
    expect(result).toHaveLength(3) // conflicts are skipped
    expect(result[0]).toEqual({
      target_type: 'engram',
      target: 'ENG-2026-0301-001',
      type: 'semantic',
      strength: 0.5,
    })
    expect(result[1].target).toBe('ENG-2026-0301-002')
    expect(result[2].target).toBe('ENG-2026-0301-003')
  })
})

// --- fillTokenBudget ---

describe('fillTokenBudget', () => {
  it('respects token cap', () => {
    const engrams = Array.from({ length: 20 }, (_, i) =>
      makeScoredEngram({ id: `ENG-2026-0301-${String(i + 1).padStart(3, '0')}`, statement: `Statement ${i}` }, 10 - i * 0.1)
    )
    const { selected, tokens_used } = fillTokenBudget(engrams, 200)
    expect(tokens_used).toBeLessThanOrEqual(200)
    expect(selected.length).toBeLessThan(20)
  })

  it('enforces per-pack diversity limit', () => {
    const engrams = Array.from({ length: 10 }, (_, i) =>
      makeScoredEngram({
        id: `ENG-2026-0301-${String(i + 1).padStart(3, '0')}`,
        statement: `Pack engram ${i}`,
        pack: 'test-pack',
      }, 10 - i)
    )
    const { selected } = fillTokenBudget(engrams, 10000)
    expect(selected.length).toBe(5) // MAX_PER_PACK = 5
  })

  it('skips oversized engrams but continues filling with smaller ones', () => {
    const small = makeScoredEngram({
      id: 'ENG-2026-0301-001',
      statement: 'Small',
    }, 10)
    const large = makeScoredEngram({
      id: 'ENG-2026-0301-002',
      statement: 'This is a very large engram with extensive content '.repeat(20),
      rationale: 'Long rationale '.repeat(10),
      knowledge_anchors: Array.from({ length: 5 }, (_, i) => ({
        path: `doc-${i}.md`,
        relevance: 'primary' as const,
        snippet: 'A fairly long snippet that adds to the token count significantly',
      })),
    }, 9) // Lower score than small, but still higher than next
    const anotherSmall = makeScoredEngram({
      id: 'ENG-2026-0301-003',
      statement: 'Another small engram',
    }, 8)

    // Budget that fits small engrams but not the large one
    const smallCost = estimateTokens(small)
    const largeCost = estimateTokens(large)
    expect(largeCost).toBeGreaterThan(smallCost * 3) // Verify large is actually large

    const budget = smallCost * 3 // Enough for 3 small engrams but not the large one
    const { selected } = fillTokenBudget([small, large, anotherSmall], budget)

    // Should include small and anotherSmall, skipping large
    expect(selected.map(e => e.id)).toContain('ENG-2026-0301-001')
    expect(selected.map(e => e.id)).toContain('ENG-2026-0301-003')
    expect(selected.map(e => e.id)).not.toContain('ENG-2026-0301-002')
  })

  it('allows unlimited personal engrams', () => {
    const engrams = Array.from({ length: 8 }, (_, i) =>
      makeScoredEngram({
        id: `ENG-2026-0301-${String(i + 1).padStart(3, '0')}`,
        statement: `Personal engram ${i}`,
        pack: null,
      }, 10 - i)
    )
    const { selected } = fillTokenBudget(engrams, 10000)
    expect(selected.length).toBe(8)
  })
})

// --- aggregateAnchors ---

describe('aggregateAnchors', () => {
  it('deduplicates by path keeping highest relevance', () => {
    const directives: AgentEngram[] = [
      {
        ...makeScoredEngram({
          id: 'ENG-2026-0301-001',
          knowledge_anchors: [
            { path: 'zettel/test.md', relevance: 'supporting', snippet: 'test snippet' },
          ],
        }),
      },
    ]
    const consider: AgentEngram[] = [
      {
        ...makeScoredEngram({
          id: 'ENG-2026-0301-002',
          knowledge_anchors: [
            { path: 'zettel/test.md', relevance: 'primary', snippet: 'primary snippet' },
          ],
        }, 3),
      },
    ]
    const result = aggregateAnchors(directives, consider)
    expect(result).toHaveLength(1)
    expect(result[0].relevance).toBe('primary')
  })

  it('sorts by relevance rank then by score', () => {
    const directives: AgentEngram[] = [
      {
        ...makeScoredEngram({
          id: 'ENG-2026-0301-001',
          knowledge_anchors: [
            { path: 'a.md', relevance: 'example' },
            { path: 'b.md', relevance: 'primary' },
          ],
        }, 10),
      },
      {
        ...makeScoredEngram({
          id: 'ENG-2026-0301-002',
          knowledge_anchors: [
            { path: 'c.md', relevance: 'supporting' },
          ],
        }, 8),
      },
    ]
    const result = aggregateAnchors(directives, [])
    expect(result[0].path).toBe('b.md')       // primary first
    expect(result[1].path).toBe('c.md')       // supporting
    expect(result[2].path).toBe('a.md')       // example last
  })

  it('caps at 10 anchors', () => {
    const anchors = Array.from({ length: 15 }, (_, i) => ({
      path: `doc-${i}.md`,
      relevance: 'supporting' as const,
    }))
    const directives: AgentEngram[] = [{
      ...makeScoredEngram({ id: 'ENG-2026-0301-001', knowledge_anchors: anchors }),
    }]
    const result = aggregateAnchors(directives, [])
    expect(result).toHaveLength(10)
  })
})

// --- selectAndSpread ---

describe('selectAndSpread', () => {
  it('returns empty result for no matching engrams', () => {
    const result = selectAndSpread(
      { prompt: 'something completely unrelated xyz123' },
      [makeEngram({ statement: 'Python is great', tags: ['python'] })],
      [],
    )
    expect(result.directives).toHaveLength(0)
    expect(result.consider).toHaveLength(0)
    expect(result.related_documents).toHaveLength(0)
  })

  it('returns directives for matching engrams', () => {
    const engrams = [
      makeEngram({
        id: 'ENG-2026-0301-001',
        statement: 'Use TypeScript for all backend services',
        tags: ['typescript', 'backend'],
      }),
      makeEngram({
        id: 'ENG-2026-0301-002',
        statement: 'Always validate API responses',
        tags: ['api', 'validation'],
      }),
    ]
    const result = selectAndSpread(
      { prompt: 'building a typescript backend api service' },
      engrams,
      [],
    )
    expect(result.directives.length).toBeGreaterThan(0)
    expect(result.directives.some(d => d.id === 'ENG-2026-0301-001')).toBe(true)
  })

  it('discovers consider candidates via spreading activation', () => {
    const engrams = [
      makeEngram({
        id: 'ENG-2026-0301-001',
        statement: 'Use repository pattern for data access',
        tags: ['architecture'],
        associations: [
          { target_type: 'engram', target: 'ENG-2026-0301-002', type: 'semantic', strength: 0.8 },
        ],
      }),
      makeEngram({
        id: 'ENG-2026-0301-002',
        statement: 'Prefer dependency injection for testability',
        tags: ['testing'],
        // No direct keyword match to 'architecture'
      }),
    ]
    const result = selectAndSpread(
      { prompt: 'architecture patterns for data layer' },
      engrams,
      [],
    )
    // First engram should be a directive (direct match on 'architecture')
    expect(result.directives.some(d => d.id === 'ENG-2026-0301-001')).toBe(true)
    // Second engram should appear in consider (via spreading from first)
    const allIds = [...result.directives, ...result.consider].map(e => e.id)
    expect(allIds).toContain('ENG-2026-0301-002')
  })

  it('does not duplicate engrams between directives and consider', () => {
    const engrams = [
      makeEngram({
        id: 'ENG-2026-0301-001',
        statement: 'Use TypeScript strict mode',
        tags: ['typescript'],
        associations: [
          { target_type: 'engram', target: 'ENG-2026-0301-002', type: 'semantic', strength: 0.8 },
        ],
      }),
      makeEngram({
        id: 'ENG-2026-0301-002',
        statement: 'Configure TypeScript with ESM modules',
        tags: ['typescript', 'esm'],
      }),
    ]
    const result = selectAndSpread(
      { prompt: 'typescript configuration best practices' },
      engrams,
      [],
    )
    const directiveIds = new Set(result.directives.map(d => d.id))
    const considerIds = new Set(result.consider.map(c => c.id))
    for (const id of directiveIds) {
      expect(considerIds.has(id)).toBe(false)
    }
  })

  it('includes related_documents from knowledge anchors', () => {
    const engrams = [
      makeEngram({
        id: 'ENG-2026-0301-001',
        statement: 'Token pricing follows a 3-tier model',
        tags: ['pricing'],
        knowledge_anchors: [
          { path: 'zettel/Data-Pricing.md', relevance: 'primary', snippet: 'pricing model for data tokens' },
        ],
      }),
    ]
    const result = selectAndSpread(
      { prompt: 'data pricing and token economics' },
      engrams,
      [],
    )
    expect(result.related_documents.length).toBeGreaterThan(0)
    expect(result.related_documents[0].path).toBe('zettel/Data-Pricing.md')
  })

  it('returns structured tokens_used', () => {
    const engrams = [
      makeEngram({
        id: 'ENG-2026-0301-001',
        statement: 'Always use strict TypeScript',
        tags: ['typescript'],
      }),
    ]
    const result = selectAndSpread(
      { prompt: 'typescript development' },
      engrams,
      [],
    )
    expect(result.tokens_used).toHaveProperty('directives')
    expect(result.tokens_used).toHaveProperty('consider')
    expect(typeof result.tokens_used.directives).toBe('number')
    expect(typeof result.tokens_used.consider).toBe('number')
  })
})

// --- Schema boost in selectAndSpread ---

describe('schema boost', () => {
  const makeSchemaEngram = (id: string, tags: string[], statement: string) =>
    makeEngram({ id, tags, statement })

  it('rescues sub-threshold engram when schema peer is above minRelevance', () => {
    // First engram: strong keyword match for "typescript"
    // Second engram: weak match (only via "development") — below threshold without boost
    const engrams = [
      makeSchemaEngram('ENG-2026-0301-001', ['typescript'], 'Use TypeScript strictly'),
      makeSchemaEngram('ENG-2026-0301-002', ['development'], 'Use ESLint for linting in development'),
    ]
    const schema: SchemaDefinition = {
      id: 'SCH-2026-0301-001',
      name: 'Code quality',
      members: ['ENG-2026-0301-001', 'ENG-2026-0301-002'],
      confidence: 0.8,
      status: 'active',
      shared_anchors: [],
      created: '2026-03-01',
      updated: '2026-03-01',
    }

    // Without schema: second engram may not appear (weak match)
    const resultNoSchema = selectAndSpread(
      { prompt: 'typescript development' },
      engrams,
      [],
      [],
    )
    const idsNoSchema = [...resultNoSchema.directives, ...resultNoSchema.consider].map(e => e.id)

    // With schema: second engram gets +2.0 boost because peer (first) cleared threshold
    const resultWithSchema = selectAndSpread(
      { prompt: 'typescript development' },
      engrams,
      [],
      [schema],
    )
    const idsWithSchema = [...resultWithSchema.directives, ...resultWithSchema.consider].map(e => e.id)

    // Both should appear with schema boost
    expect(idsWithSchema).toContain('ENG-2026-0301-001')
    expect(idsWithSchema).toContain('ENG-2026-0301-002')
  })

  it('no schema boost when no peers cleared threshold', () => {
    const engrams = [
      makeSchemaEngram('ENG-2026-0301-001', ['unrelated'], 'Something about cooking'),
      makeSchemaEngram('ENG-2026-0301-002', ['unrelated'], 'Something about music'),
    ]
    const schema: SchemaDefinition = {
      id: 'SCH-2026-0301-001',
      name: 'Test',
      members: ['ENG-2026-0301-001', 'ENG-2026-0301-002'],
      confidence: 0.8,
      status: 'active',
      shared_anchors: [],
      created: '2026-03-01',
      updated: '2026-03-01',
    }

    const result = selectAndSpread(
      { prompt: 'typescript development' },
      engrams,
      [],
      [schema],
    )
    expect(result.directives).toHaveLength(0)
  })

  it('works with empty schemas (backward compatible)', () => {
    const engrams = [
      makeSchemaEngram('ENG-2026-0301-001', ['typescript'], 'Use TypeScript strictly'),
    ]
    const result = selectAndSpread(
      { prompt: 'typescript development' },
      engrams,
      [],
      [],
    )
    expect(result.directives.length).toBeGreaterThan(0)
  })
})

// --- scoreEngram ---

describe('scoreEngram', () => {
  it('returns 0 when scope filter excludes engram', () => {
    const engram = makeEngram({ scope: 'agent:writer' })
    const score = scoreEngram(engram, 'test', new Set(['test']), [], 'global', false)
    expect(score).toBe(0)
  })

  it('scores based on keyword overlap', () => {
    const engram = makeEngram({
      statement: 'Always use typescript for backend services',
      tags: ['typescript'],
    })
    const score = scoreEngram(engram, 'typescript backend', new Set(['typescript', 'backend']), [], undefined, false)
    expect(score).toBeGreaterThan(0)
  })

  it('applies feedback signal boost', () => {
    const baseEngram = makeEngram({
      statement: 'Use repository pattern',
      tags: ['architecture'],
    })
    const boostedEngram = makeEngram({
      statement: 'Use repository pattern',
      tags: ['architecture'],
      feedback_signals: { positive: 5, negative: 0, neutral: 0 },
    })
    const baseScore = scoreEngram(baseEngram, 'architecture', new Set(['architecture']), [], undefined, false)
    const boostedScore = scoreEngram(boostedEngram, 'architecture', new Set(['architecture']), [], undefined, false)
    expect(boostedScore).toBeGreaterThan(baseScore)
  })
})
