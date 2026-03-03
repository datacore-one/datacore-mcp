import { describe, it, expect } from 'vitest'
import { detectSchemas } from '../src/schema-detection.js'
import type { Engram } from '../src/schemas/engram.js'
import type { SchemaDefinition } from '../src/schemas/schema-definition.js'

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

describe('detectSchemas', () => {
  it('detects a schema from a strongly connected group', () => {
    // Create 4 engrams all connected to each other with strong associations
    // and sharing at least 2 anchor paths
    const sharedAnchors = [
      { path: 'zettel/topic-a.md', relevance: 'primary' as const },
      { path: 'zettel/topic-b.md', relevance: 'supporting' as const },
    ]

    const engrams = [
      makeEngram('ENG-2026-0301-001', {
        knowledge_anchors: sharedAnchors,
        associations: [
          { target_type: 'engram', target: 'ENG-2026-0301-002', strength: 0.6, type: 'semantic' },
          { target_type: 'engram', target: 'ENG-2026-0301-003', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'ENG-2026-0301-004', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('ENG-2026-0301-002', {
        knowledge_anchors: sharedAnchors,
        associations: [
          { target_type: 'engram', target: 'ENG-2026-0301-001', strength: 0.6, type: 'semantic' },
          { target_type: 'engram', target: 'ENG-2026-0301-003', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('ENG-2026-0301-003', {
        knowledge_anchors: sharedAnchors,
        associations: [
          { target_type: 'engram', target: 'ENG-2026-0301-001', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'ENG-2026-0301-002', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'ENG-2026-0301-004', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('ENG-2026-0301-004', {
        knowledge_anchors: sharedAnchors,
        associations: [
          { target_type: 'engram', target: 'ENG-2026-0301-001', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'ENG-2026-0301-003', strength: 0.5, type: 'semantic' },
        ],
      }),
    ]

    const result = detectSchemas(engrams, [])
    expect(result.created).toHaveLength(1)
    expect(result.created[0].members).toHaveLength(4)
    expect(result.created[0].status).toBe('candidate')
    expect(result.created[0].confidence).toBeGreaterThan(0)
    expect(result.created[0].shared_anchors).toContain('zettel/topic-a.md')
  })

  it('filters out nodes with fewer than k=2 neighbors (k-core)', () => {
    // A-B-C chain: A has 1 neighbor (B), C has 1 neighbor (B) => both pruned
    // Only B remains with 0 neighbors after pruning => no schema
    const engrams = [
      makeEngram('A', {
        knowledge_anchors: [{ path: 'a.md', relevance: 'primary' }],
        associations: [{ target_type: 'engram', target: 'B', strength: 0.5, type: 'semantic' }],
      }),
      makeEngram('B', {
        knowledge_anchors: [{ path: 'a.md', relevance: 'primary' }],
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('C', {
        knowledge_anchors: [{ path: 'a.md', relevance: 'primary' }],
        associations: [{ target_type: 'engram', target: 'B', strength: 0.5, type: 'semantic' }],
      }),
    ]

    const result = detectSchemas(engrams, [])
    expect(result.created).toHaveLength(0)
  })

  it('rejects component with fewer than 2 shared anchors', () => {
    // Fully connected triangle but only 1 shared anchor
    const anchor = [{ path: 'single.md', relevance: 'primary' as const }]
    const engrams = [
      makeEngram('A', {
        knowledge_anchors: anchor,
        associations: [
          { target_type: 'engram', target: 'B', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('B', {
        knowledge_anchors: anchor,
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('C', {
        knowledge_anchors: [{ path: 'other.md', relevance: 'primary' }],
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'B', strength: 0.5, type: 'semantic' },
        ],
      }),
    ]

    const result = detectSchemas(engrams, [])
    // only 'single.md' is shared by A+B (count=2), 'other.md' only by C (count=1)
    // So only 1 shared anchor path => rejected
    expect(result.created).toHaveLength(0)
  })

  it('updates existing schema by Jaccard overlap', () => {
    const anchors = [
      { path: 'a.md', relevance: 'primary' as const },
      { path: 'b.md', relevance: 'supporting' as const },
    ]
    const engrams = [
      makeEngram('A', {
        knowledge_anchors: anchors,
        associations: [
          { target_type: 'engram', target: 'B', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('B', {
        knowledge_anchors: anchors,
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.5, type: 'semantic' },
        ],
      }),
      makeEngram('C', {
        knowledge_anchors: anchors,
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.5, type: 'semantic' },
          { target_type: 'engram', target: 'B', strength: 0.5, type: 'semantic' },
        ],
      }),
    ]

    const existing: SchemaDefinition[] = [{
      id: 'SCH-2026-0301-001',
      name: 'Existing',
      members: ['A', 'B'],
      confidence: 0.3,
      status: 'active',
      shared_anchors: ['a.md'],
      created: '2026-03-01',
      updated: '2026-03-01',
    }]

    const result = detectSchemas(engrams, existing)
    expect(result.updated).toHaveLength(1)
    expect(result.updated[0].id).toBe('SCH-2026-0301-001')
    expect(result.updated[0].members).toContain('C')
    expect(result.created).toHaveLength(0)
  })

  it('flags schemas older than 90 days', () => {
    const old: SchemaDefinition = {
      id: 'SCH-2025-1201-001',
      name: 'Old schema',
      members: ['X', 'Y', 'Z'],
      confidence: 0.5,
      status: 'active',
      shared_anchors: ['old.md'],
      created: '2025-12-01',
      updated: '2025-12-01',
    }

    const result = detectSchemas([], [old])
    expect(result.flagged).toHaveLength(1)
    expect(result.flagged[0].id).toBe('SCH-2025-1201-001')
  })

  it('does not flag archived schemas', () => {
    const old: SchemaDefinition = {
      id: 'SCH-2025-1201-001',
      name: 'Archived',
      members: ['X'],
      confidence: 0.5,
      status: 'archived',
      shared_anchors: [],
      created: '2025-12-01',
      updated: '2025-12-01',
    }

    const result = detectSchemas([], [old])
    expect(result.flagged).toHaveLength(0)
  })

  it('skips associations below strength threshold', () => {
    const anchors = [
      { path: 'a.md', relevance: 'primary' as const },
      { path: 'b.md', relevance: 'supporting' as const },
    ]
    const engrams = [
      makeEngram('A', {
        knowledge_anchors: anchors,
        associations: [
          { target_type: 'engram', target: 'B', strength: 0.2, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.2, type: 'semantic' },
        ],
      }),
      makeEngram('B', {
        knowledge_anchors: anchors,
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.2, type: 'semantic' },
          { target_type: 'engram', target: 'C', strength: 0.2, type: 'semantic' },
        ],
      }),
      makeEngram('C', {
        knowledge_anchors: anchors,
        associations: [
          { target_type: 'engram', target: 'A', strength: 0.2, type: 'semantic' },
          { target_type: 'engram', target: 'B', strength: 0.2, type: 'semantic' },
        ],
      }),
    ]

    const result = detectSchemas(engrams, [])
    // All associations at 0.2 < MIN_STRENGTH (0.4) => no graph edges => no schemas
    expect(result.created).toHaveLength(0)
  })
})
