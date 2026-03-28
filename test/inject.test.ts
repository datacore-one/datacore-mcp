// test/inject.test.ts
import { describe, it, expect } from 'vitest'
import { selectAndSpread, type InjectionContext } from '../src/inject.js'
import type { Engram } from '../src/schemas/engram.js'
import type { LoadedPack } from '../src/engrams.js'

const makeEngram = (overrides: Partial<Engram> & { id: string; statement: string }): Engram => ({
  version: 2, status: 'active', type: 'behavioral', scope: 'global',
  visibility: 'private', consolidated: false, derivation_count: 1, tags: [], pack: null,
  abstract: null, derived_from: null, knowledge_anchors: [], associations: [],
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

describe('selectAndSpread', () => {
  it('returns empty when no engrams match', () => {
    const ctx: InjectionContext = { prompt: 'fix CSS margin issue' }
    const engrams = [makeEngram({ id: 'ENG-2026-0219-001', statement: 'Check data ownership', tags: ['data', 'privacy'] })]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives).toHaveLength(0)
  })

  it('matches engrams by tag overlap with prompt', () => {
    const ctx: InjectionContext = { prompt: 'design a data model for user profiles' }
    const engrams = [makeEngram({
      id: 'ENG-2026-0219-001', statement: 'Validate data ownership',
      tags: ['data', 'ownership'], domain: 'ethics.data-sovereignty',
    })]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives).toHaveLength(1)
  })

  it('matches pack engrams via match_terms', () => {
    const ctx: InjectionContext = { prompt: 'design an app that handles user consent' }
    const pack = makePack('fds-v1', 'on_match', ['design', 'privacy', 'consent', 'data'], [
      makeEngram({ id: 'ENG-2026-0219-010', statement: 'Require explicit consent', tags: ['consent'], pack: 'fds-v1' }),
    ])
    const result = selectAndSpread(ctx, [], [pack])
    expect(result.directives).toHaveLength(1)
  })

  it('skips on_request packs', () => {
    const ctx: InjectionContext = { prompt: 'design something' }
    const pack = makePack('stoic-v1', 'on_request', ['decision', 'ethics'], [
      makeEngram({ id: 'ENG-2026-0219-020', statement: 'Focus on what you can control', tags: ['stoicism'], pack: 'stoic-v1' }),
    ])
    const result = selectAndSpread(ctx, [], [pack])
    expect(result.directives).toHaveLength(0)
  })

  it('respects token budget', () => {
    const ctx: InjectionContext = { prompt: 'data privacy design architecture', maxTokens: 200 }
    const engrams = Array.from({ length: 50 }, (_, i) =>
      makeEngram({ id: `ENG-2026-0219-${String(i).padStart(3, '0')}`, statement: `Data privacy principle ${i}`, tags: ['data', 'privacy'] })
    )
    const result = selectAndSpread(ctx, engrams, [])
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
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives).toHaveLength(0)
  })

  it('applies diversity penalty (max 5 per pack)', () => {
    const ctx: InjectionContext = { prompt: 'design data architecture' }
    const pack = makePack('heavy', 'on_match', ['design', 'data', 'architecture'],
      Array.from({ length: 10 }, (_, i) =>
        makeEngram({ id: `ENG-2026-0219-${String(i).padStart(3, '0')}`, statement: `Heavy ${i}`, tags: ['design'], pack: 'heavy' })
      ))
    const result = selectAndSpread(ctx, [], [pack])
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
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives[0].id).toBe('ENG-2026-0219-002')
  })

  it('filters by scope=global', () => {
    const ctx: InjectionContext = { prompt: 'data handling', scope: 'global' }
    const engrams = [
      makeEngram({ id: 'ENG-001', statement: 'Global rule', tags: ['data'], scope: 'global' }),
      makeEngram({ id: 'ENG-002', statement: 'Agent rule', tags: ['data'], scope: 'agent:researcher' }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    const all = [...result.directives, ...result.consider]
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('ENG-001')
  })

  it('filters by scope prefix and includes global', () => {
    const ctx: InjectionContext = { prompt: 'data handling', scope: 'agent:researcher' }
    const engrams = [
      makeEngram({ id: 'ENG-001', statement: 'Global rule', tags: ['data'], scope: 'global' }),
      makeEngram({ id: 'ENG-002', statement: 'Agent rule', tags: ['data'], scope: 'agent:researcher' }),
      makeEngram({ id: 'ENG-003', statement: 'Other agent rule', tags: ['data'], scope: 'agent:writer' }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    const all = [...result.directives, ...result.consider]
    expect(all).toHaveLength(2)
    const ids = all.map(e => e.id).sort()
    expect(ids).toEqual(['ENG-001', 'ENG-002'])
  })

  it('boosts consolidated engrams', () => {
    const ctx: InjectionContext = { prompt: 'data handling' }
    const engrams = [
      makeEngram({ id: 'ENG-001', statement: 'Not consolidated', tags: ['data'], consolidated: false,
        activation: { retrieval_strength: 0.8, storage_strength: 0.5, frequency: 3, last_accessed: '2026-02-19' } }),
      makeEngram({ id: 'ENG-002', statement: 'Consolidated', tags: ['data'], consolidated: true,
        activation: { retrieval_strength: 0.8, storage_strength: 0.5, frequency: 3, last_accessed: '2026-02-19' } }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    // Consolidated should rank higher due to 1.1x boost
    expect(result.directives[0].id).toBe('ENG-002')
  })

  it('boosts engrams with positive feedback', () => {
    const ctx: InjectionContext = { prompt: 'data handling' }
    const engrams = [
      makeEngram({ id: 'ENG-001', statement: 'No feedback', tags: ['data'],
        feedback_signals: { positive: 0, negative: 0, neutral: 0 } }),
      makeEngram({ id: 'ENG-002', statement: 'Positive feedback', tags: ['data'],
        feedback_signals: { positive: 5, negative: 0, neutral: 0 } }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives[0].id).toBe('ENG-002')
  })

  it('penalizes engrams with negative feedback', () => {
    const ctx: InjectionContext = { prompt: 'data handling' }
    const engrams = [
      makeEngram({ id: 'ENG-001', statement: 'No feedback', tags: ['data'],
        feedback_signals: { positive: 0, negative: 0, neutral: 0 } }),
      makeEngram({ id: 'ENG-002', statement: 'Negative feedback', tags: ['data'],
        feedback_signals: { positive: 0, negative: 3, neutral: 0 } }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives[0].id).toBe('ENG-001')
  })

  it('applies decay to personal engrams (old engrams score lower)', () => {
    const ctx: InjectionContext = { prompt: 'data handling', minRelevance: 0.1 }
    const engrams = [
      makeEngram({ id: 'ENG-001', statement: 'Recent engram', tags: ['data'],
        activation: { retrieval_strength: 0.8, storage_strength: 0.5, frequency: 3, last_accessed: new Date().toISOString().split('T')[0] } }),
      makeEngram({ id: 'ENG-002', statement: 'Old engram', tags: ['data'],
        activation: { retrieval_strength: 0.8, storage_strength: 0.5, frequency: 3, last_accessed: '2025-01-01' } }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    const all = [...result.directives, ...result.consider]
    expect(all[0].id).toBe('ENG-001')
  })

  it('does not apply decay to pack engrams', () => {
    const ctx: InjectionContext = { prompt: 'consent data design' }
    const pack = makePack('fds-v1', 'on_match', ['design', 'consent', 'data'], [
      makeEngram({ id: 'ENG-PACK-001', statement: 'Require explicit consent', tags: ['consent'], pack: 'fds-v1',
        activation: { retrieval_strength: 0.9, storage_strength: 0.9, frequency: 0, last_accessed: '2024-01-01' } }),
    ])
    const result = selectAndSpread(ctx, [], [pack])
    // Pack engram should still match despite very old last_accessed
    expect(result.directives.length + result.consider.length).toBe(1)
  })
})

describe('injection backward compatibility', () => {
  it('returns empty constraints array when no dont-patterns exist', () => {
    const ctx: InjectionContext = { prompt: 'data handling design' }
    const engrams = [makeEngram({
      id: 'ENG-BC-001', statement: 'Use structured logging for all services',
      tags: ['data'],
    })]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.constraints).toEqual([])
    expect(result.directives).toHaveLength(1)
    expect(result.directives[0].statement).toBe('Use structured logging for all services')
  })

  it('includes confidence_score as number on all WireEngrams', () => {
    const ctx: InjectionContext = { prompt: 'data handling design' }
    const engrams = [makeEngram({
      id: 'ENG-BC-002', statement: 'Always validate data inputs',
      tags: ['data'],
      feedback_signals: { positive: 5, negative: 1, neutral: 2 },
    })]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives).toHaveLength(1)
    const wire = result.directives[0]
    expect(wire).toHaveProperty('confidence_score')
    expect(typeof wire.confidence_score).toBe('number')
    expect(wire.confidence_score).toBeGreaterThanOrEqual(0)
    expect(wire.confidence_score).toBeLessThanOrEqual(1)
  })

  it('includes constraints in tokens_used', () => {
    const ctx: InjectionContext = { prompt: 'data handling design' }
    const engrams = [
      makeEngram({ id: 'ENG-BC-003', statement: 'Use data validation', tags: ['data'] }),
      makeEngram({ id: 'ENG-BC-004', statement: 'Never expose raw data to clients', tags: ['data'] }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.tokens_used).toHaveProperty('constraints')
    expect(typeof result.tokens_used.constraints).toBe('number')
  })
})

describe('injection polarity split', () => {
  it('separates dont-pattern engrams into constraints', () => {
    const ctx: InjectionContext = { prompt: 'data handling design' }
    const engrams = [
      makeEngram({ id: 'ENG-PS-001', statement: 'Use structured logging', tags: ['data'] }),
      makeEngram({ id: 'ENG-PS-002', statement: 'Never store plaintext passwords in data', tags: ['data'] }),
    ]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.directives.map(e => e.id)).toContain('ENG-PS-001')
    expect(result.constraints.map(e => e.id)).toContain('ENG-PS-002')
    // Should not be in the other bucket
    expect(result.directives.map(e => e.id)).not.toContain('ENG-PS-002')
    expect(result.constraints.map(e => e.id)).not.toContain('ENG-PS-001')
  })

  it('auto-classifies dont when polarity field is null', () => {
    const ctx: InjectionContext = { prompt: 'data handling design' }
    // No polarity field set (defaults to null in makeEngram)
    const engrams = [makeEngram({
      id: 'ENG-PS-003', statement: 'Never commit secrets to data repositories',
      tags: ['data'],
    })]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.constraints).toHaveLength(1)
    expect(result.constraints[0].id).toBe('ENG-PS-003')
    expect(result.directives).toHaveLength(0)
  })

  it('respects existing polarity=dont on engram', () => {
    const ctx: InjectionContext = { prompt: 'data handling design' }
    const engrams = [makeEngram({
      id: 'ENG-PS-004', statement: 'Check data before processing',
      tags: ['data'],
      polarity: 'dont' as any,
    })]
    const result = selectAndSpread(ctx, engrams, [])
    expect(result.constraints).toHaveLength(1)
    expect(result.constraints[0].id).toBe('ENG-PS-004')
  })
})
