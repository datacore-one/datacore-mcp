import { describe, it, expect } from 'vitest'
import {
  calculateFitness,
  createLEPPacket,
  validateLEPPacket,
  importLEPEngrams,
  levenshteinDistance,
} from '../src/exchange.js'
import type { Engram } from '../src/schemas/engram.js'

function makeEngram(id: string, overrides: Partial<Engram> = {}): Engram {
  return {
    id,
    version: 2,
    status: 'active',
    consolidated: false,
    type: 'behavioral',
    scope: 'global',
    visibility: 'private',
    statement: `Statement for ${id}`,
    derivation_count: 1,
    knowledge_anchors: [],
    associations: [],
    tags: [],
    activation: { retrieval_strength: 0.7, storage_strength: 1.0, frequency: 1, last_accessed: '2026-03-01' },
    pack: null,
    abstract: null,
    derived_from: null,
    ...overrides,
  }
}

describe('calculateFitness', () => {
  it('returns value in [0, 1]', () => {
    const engram = makeEngram('ENG-2026-0301-001', {
      derivation_count: 3,
      activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 5, last_accessed: '2026-03-01' },
      feedback_signals: { positive: 10, negative: 1, neutral: 2 },
    })
    const fitness = calculateFitness(engram, [engram])
    expect(fitness).toBeGreaterThanOrEqual(0)
    expect(fitness).toBeLessThanOrEqual(1)
  })

  it('gives higher score to engrams with more derivations', () => {
    const low = makeEngram('ENG-2026-0301-001', { derivation_count: 1 })
    const high = makeEngram('ENG-2026-0301-002', { derivation_count: 10 })
    expect(calculateFitness(high, [high])).toBeGreaterThan(calculateFitness(low, [low]))
  })

  it('penalizes negative feedback', () => {
    const good = makeEngram('ENG-2026-0301-001', {
      feedback_signals: { positive: 5, negative: 0, neutral: 0 },
    })
    const bad = makeEngram('ENG-2026-0301-002', {
      feedback_signals: { positive: 0, negative: 5, neutral: 0 },
    })
    expect(calculateFitness(good, [good])).toBeGreaterThan(calculateFitness(bad, [bad]))
  })

  it('returns non-zero for engram with no feedback', () => {
    const engram = makeEngram('ENG-2026-0301-001')
    expect(calculateFitness(engram, [engram])).toBeGreaterThan(0)
  })
})

describe('createLEPPacket', () => {
  it('only includes public/template engrams', () => {
    const engrams = [
      makeEngram('ENG-2026-0301-001', { visibility: 'private' }),
      makeEngram('ENG-2026-0301-002', { visibility: 'public' }),
      makeEngram('ENG-2026-0301-003', { visibility: 'template' }),
    ]
    const packet = createLEPPacket(engrams, engrams, 'test-sender')
    expect(packet.engrams).toHaveLength(2)
    expect(packet.sender).toBe('test-sender')
    expect(packet.id).toMatch(/^LEP-/)
  })

  it('includes provenance chain', () => {
    const engrams = [makeEngram('ENG-2026-0301-001', { visibility: 'public' })]
    const packet = createLEPPacket(engrams, engrams, 'sender')
    expect(packet.engrams[0].provenance?.origin).toBe('sender')
    expect(packet.engrams[0].provenance?.chain).toContain(packet.id)
  })

  it('includes fitness score', () => {
    const engrams = [makeEngram('ENG-2026-0301-001', { visibility: 'public' })]
    const packet = createLEPPacket(engrams, engrams, 'sender')
    expect(typeof packet.engrams[0].fitness).toBe('number')
  })
})

describe('validateLEPPacket', () => {
  it('validates a well-formed packet', () => {
    const raw = {
      id: 'LEP-2026-0301-001',
      sender: 'test',
      signature: null,
      created: '2026-03-01',
      engrams: [{
        id: 'ENG-2026-0301-001',
        type: 'behavioral',
        scope: 'global',
        statement: 'Test statement',
        tags: [],
        fitness: 0.5,
      }],
    }
    const packet = validateLEPPacket(raw)
    expect(packet.engrams).toHaveLength(1)
  })

  it('throws on invalid packet', () => {
    expect(() => validateLEPPacket({ id: 'bad' })).toThrow()
  })
})

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
  })

  it('returns correct distance for simple edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
  })

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3)
    expect(levenshteinDistance('abc', '')).toBe(3)
  })
})

describe('importLEPEngrams', () => {
  it('imports engrams as candidates', () => {
    const packet = {
      id: 'LEP-2026-0301-001',
      sender: 'remote',
      signature: null,
      created: '2026-03-01',
      engrams: [{
        id: 'ENG-2026-0301-R01',
        type: 'behavioral' as const,
        scope: 'global',
        statement: 'Unique remote knowledge',
        tags: ['imported'],
        fitness: 0.8,
      }],
    }
    const existing: Engram[] = [makeEngram('ENG-2026-0301-001')]
    const result = importLEPEngrams(packet, existing)
    expect(result.imported).toBe(1)
    expect(result.candidates[0].fitness).toBe(0.8)
    // Verify the engram was added to existing array
    expect(existing).toHaveLength(2)
    expect(existing[1].status).toBe('candidate')
    expect(existing[1].pack).toBe('LEP-2026-0301-001')
    expect(existing[1].derived_from).toBe('ENG-2026-0301-R01')
    expect(existing[1].tags).toContain('_trial')
    const expiryTag = existing[1].tags.find(t => t.startsWith('_trial_expires:'))
    expect(expiryTag).toBeDefined()
    // Trial expiry should be ~30 days from now
    const expiryDate = new Date(expiryTag!.split(':')[1])
    const daysUntilExpiry = Math.round((expiryDate.getTime() - Date.now()) / 86400000)
    expect(daysUntilExpiry).toBeGreaterThanOrEqual(29)
    expect(daysUntilExpiry).toBeLessThanOrEqual(31)
  })

  it('rejects engrams below fitness threshold', () => {
    const packet = {
      id: 'LEP-2026-0301-001',
      sender: 'remote',
      signature: null,
      created: '2026-03-01',
      engrams: [{
        id: 'ENG-2026-0301-R01',
        type: 'behavioral' as const,
        scope: 'global',
        statement: 'Low quality',
        tags: [],
        fitness: 0.1,
      }],
    }
    const result = importLEPEngrams(packet, [], { fitnessThreshold: 0.3 })
    expect(result.imported).toBe(0)
    expect(result.skipped_fitness).toBe(1)
  })

  it('detects duplicates via Levenshtein', () => {
    const packet = {
      id: 'LEP-2026-0301-001',
      sender: 'remote',
      signature: null,
      created: '2026-03-01',
      engrams: [{
        id: 'ENG-2026-0301-R01',
        type: 'behavioral' as const,
        scope: 'global',
        statement: 'Use TypeScript for backend services',
        tags: [],
        fitness: 0.8,
      }],
    }
    const existing = [makeEngram('ENG-2026-0301-001', {
      statement: 'Use TypeScript for backend services', // exact duplicate
    })]
    const result = importLEPEngrams(packet, existing)
    expect(result.imported).toBe(0)
    expect(result.skipped_duplicate).toBe(1)
  })

  it('enforces source cap', () => {
    const packet = {
      id: 'LEP-2026-0301-001',
      sender: 'heavy-source',
      signature: null,
      created: '2026-03-01',
      engrams: [{
        id: 'ENG-2026-0301-R01',
        type: 'behavioral' as const,
        scope: 'global',
        statement: 'New knowledge',
        tags: [],
        fitness: 0.8,
      }],
    }
    // Create existing: 5 personal + 2 from heavy-source (40% > 20% cap)
    // Imported engrams have provenance.origin matching sender, per real import behavior
    const existing = [
      ...Array.from({ length: 5 }, (_, i) => makeEngram(`ENG-2026-0301-${String(i + 1).padStart(3, '0')}`)),
      ...Array.from({ length: 2 }, (_, i) => makeEngram(`ENG-2026-0301-${String(i + 10).padStart(3, '0')}`, {
        pack: 'LEP-2026-0201-001',
        provenance: { origin: 'heavy-source', chain: ['LEP-2026-0201-001'], signature: null, license: 'cc-by-sa-4.0' },
      })),
    ]
    const result = importLEPEngrams(packet, existing)
    expect(result.skipped_source_cap).toBe(true)
    expect(result.imported).toBe(0)
  })
})
