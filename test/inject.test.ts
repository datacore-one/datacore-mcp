// test/inject.test.ts
import { describe, it, expect } from 'vitest'
import { selectEngrams, type InjectionContext } from '../src/inject.js'
import type { Engram } from '../src/schemas/engram.js'
import type { LoadedPack } from '../src/engrams.js'

const makeEngram = (overrides: Partial<Engram> & { id: string; statement: string }): Engram => ({
  version: 2, status: 'active', type: 'behavioral', scope: 'global',
  visibility: 'private', consolidated: false, derivation_count: 1, tags: [], pack: null,
  abstract: null, derived_from: null,
  activation: { retrieval_strength: 0.8, storage_strength: 0.5, frequency: 3, last_accessed: '2026-02-19' },
  ...overrides,
})

const makePack = (id: string, policy: 'on_match' | 'on_request', matchTerms: string[], engrams: Engram[]): LoadedPack => ({
  manifest: {
    name: id, description: 'test', version: '1.0.0', tags: [],
    'x-datacore': { id, injection_policy: policy, match_terms: matchTerms, engram_count: engrams.length },
  },
  engrams,
})

describe('selectEngrams', () => {
  it('returns empty when no engrams match', () => {
    const ctx: InjectionContext = { prompt: 'fix CSS margin issue' }
    const engrams = [makeEngram({ id: 'ENG-2026-0219-001', statement: 'Check data ownership', tags: ['data', 'privacy'] })]
    const result = selectEngrams(ctx, engrams, [])
    expect(result.directives).toHaveLength(0)
  })

  it('matches engrams by tag overlap with prompt', () => {
    const ctx: InjectionContext = { prompt: 'design a data model for user profiles' }
    const engrams = [makeEngram({
      id: 'ENG-2026-0219-001', statement: 'Validate data ownership',
      tags: ['data', 'ownership'], domain: 'ethics.data-sovereignty',
    })]
    const result = selectEngrams(ctx, engrams, [])
    expect(result.directives).toHaveLength(1)
  })

  it('matches pack engrams via match_terms', () => {
    const ctx: InjectionContext = { prompt: 'design an app that handles user consent' }
    const pack = makePack('fds-v1', 'on_match', ['design', 'privacy', 'consent', 'data'], [
      makeEngram({ id: 'ENG-2026-0219-010', statement: 'Require explicit consent', tags: ['consent'], pack: 'fds-v1' }),
    ])
    const result = selectEngrams(ctx, [], [pack])
    expect(result.directives).toHaveLength(1)
  })

  it('skips on_request packs', () => {
    const ctx: InjectionContext = { prompt: 'design something' }
    const pack = makePack('stoic-v1', 'on_request', ['decision', 'ethics'], [
      makeEngram({ id: 'ENG-2026-0219-020', statement: 'Focus on what you can control', tags: ['stoicism'], pack: 'stoic-v1' }),
    ])
    const result = selectEngrams(ctx, [], [pack])
    expect(result.directives).toHaveLength(0)
  })

  it('respects token budget', () => {
    const ctx: InjectionContext = { prompt: 'data privacy design architecture', maxTokens: 200 }
    const engrams = Array.from({ length: 50 }, (_, i) =>
      makeEngram({ id: `ENG-2026-0219-${String(i).padStart(3, '0')}`, statement: `Data privacy principle ${i}`, tags: ['data', 'privacy'] })
    )
    const result = selectEngrams(ctx, engrams, [])
    // ~40 tokens per engram compact, 200 budget = ~5 engrams
    expect(result.directives.length + result.consider.length).toBeLessThanOrEqual(10)
    expect(result.directives.length + result.consider.length).toBeGreaterThan(0)
  })

  it('injects nothing when no engrams meet relevance threshold', () => {
    const ctx: InjectionContext = { prompt: 'fix CSS margin issue', minRelevance: 0.3 }
    const engrams = [makeEngram({
      id: 'ENG-2026-0219-001', statement: 'Check data ownership', tags: ['data'],
      activation: { retrieval_strength: 0.1, storage_strength: 0.5, frequency: 1, last_accessed: '2026-02-19' },
    })]
    const result = selectEngrams(ctx, engrams, [])
    expect(result.directives).toHaveLength(0)
  })

  it('applies diversity penalty (max 5 per pack)', () => {
    const ctx: InjectionContext = { prompt: 'design data architecture' }
    const pack = makePack('heavy', 'on_match', ['design', 'data', 'architecture'],
      Array.from({ length: 10 }, (_, i) =>
        makeEngram({ id: `ENG-2026-0219-${String(i).padStart(3, '0')}`, statement: `Heavy ${i}`, tags: ['design'], pack: 'heavy' })
      ))
    const result = selectEngrams(ctx, [], [pack])
    const heavyCount = [...result.directives, ...result.consider].filter(e => e.pack === 'heavy').length
    expect(heavyCount).toBeLessThanOrEqual(5)
  })

  it('ranks by retrieval_strength', () => {
    const ctx: InjectionContext = { prompt: 'data handling' }
    const engrams = [
      makeEngram({ id: 'ENG-2026-0219-001', statement: 'Low priority', tags: ['data'],
        activation: { retrieval_strength: 0.3, storage_strength: 0.5, frequency: 1, last_accessed: '2026-02-19' } }),
      makeEngram({ id: 'ENG-2026-0219-002', statement: 'High priority', tags: ['data'],
        activation: { retrieval_strength: 0.9, storage_strength: 0.5, frequency: 5, last_accessed: '2026-02-19' } }),
    ]
    const result = selectEngrams(ctx, engrams, [])
    expect(result.directives[0].id).toBe('ENG-2026-0219-002')
  })
})
