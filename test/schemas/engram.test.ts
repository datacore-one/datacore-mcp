// test/schemas/engram.test.ts
import { describe, it, expect } from 'vitest'
import { EngramSchema, PackManifestSchema } from '../../src/schemas/engram.js'

describe('EngramSchema', () => {
  it('validates a minimal engram', () => {
    const engram = {
      id: 'ENG-2026-0219-001',
      version: 2,
      status: 'active',
      type: 'behavioral',
      scope: 'global',
      statement: 'Always validate input at system boundaries',
      activation: {
        retrieval_strength: 0.85,
        storage_strength: 0.6,
        frequency: 1,
        last_accessed: '2026-02-19',
      },
    }
    expect(() => EngramSchema.parse(engram)).not.toThrow()
  })

  it('validates a full v2 engram with all fields', () => {
    const engram = {
      id: 'ENG-2026-0219-002',
      version: 2,
      status: 'active',
      consolidated: true,
      type: 'procedural',
      scope: 'agent:code-reviewer',
      statement: 'Split batch operations into coordinator + per-item worker',
      rationale: 'Re-derived 4x across sessions',
      contraindications: ['Single-item operations'],
      source_patterns: ['PAT-2026-0125-003'],
      derivation_count: 4,
      knowledge_type: {
        memory_class: 'procedural',
        cognitive_level: 'apply',
      },
      domain: 'software.architecture.patterns',
      relations: {
        broader: ['software.architecture'],
        narrower: [],
        related: ['software.concurrency'],
        conflicts: [],
      },
      activation: {
        retrieval_strength: 0.85,
        storage_strength: 0.6,
        frequency: 5,
        last_accessed: '2026-02-19',
      },
      provenance: {
        origin: 'gregor/personal',
        chain: [],
        signature: null,
        license: 'cc-by-sa-4.0',
      },
      feedback_signals: { positive: 3, negative: 0, neutral: 2 },
      tags: ['architecture', 'batch-processing'],
      pack: 'datacore-starter-v1',
      abstract: null,
      derived_from: null,
    }
    expect(() => EngramSchema.parse(engram)).not.toThrow()
  })

  it('validates engrams with flexible ID formats', () => {
    const base = {
      version: 1, status: 'active', type: 'behavioral', scope: 'global',
      statement: 'Test', activation: { retrieval_strength: 0.5, storage_strength: 0.5, frequency: 1, last_accessed: '2026-02-19' },
    }
    expect(() => EngramSchema.parse({ ...base, id: 'ENG-ROOT-001' })).not.toThrow()
    expect(() => EngramSchema.parse({ ...base, id: 'ENG-DF-034' })).not.toThrow()
    expect(() => EngramSchema.parse({ ...base, id: 'ENG-HIST-102' })).not.toThrow()
    expect(() => EngramSchema.parse({ ...base, id: 'ENG-COR-025' })).not.toThrow()
    expect(() => EngramSchema.parse({ ...base, id: 'ENG-2026-0219-001' })).not.toThrow()
  })

  it('validates version 1 engrams', () => {
    const engram = {
      id: 'ENG-ROOT-001', version: 1, status: 'active', type: 'procedural',
      scope: 'global', statement: 'Test v1',
      activation: { retrieval_strength: 0.7, storage_strength: 0.5, frequency: 3, last_accessed: '2026-02-19' },
    }
    expect(() => EngramSchema.parse(engram)).not.toThrow()
  })

  it('rejects engram with invalid ID format', () => {
    const engram = {
      id: 'INVALID-001', version: 2, status: 'active', type: 'behavioral',
      scope: 'global', statement: 'Test',
      activation: { retrieval_strength: 0.5, storage_strength: 0.5, frequency: 1, last_accessed: '2026-02-19' },
    }
    expect(() => EngramSchema.parse(engram)).toThrow()
  })

  it('rejects engram with invalid status', () => {
    const engram = {
      id: 'ENG-2026-0219-003',
      version: 2,
      status: 'invalid',
      type: 'behavioral',
      scope: 'global',
      statement: 'Test',
      activation: {
        retrieval_strength: 0.5,
        storage_strength: 0.5,
        frequency: 1,
        last_accessed: '2026-02-19',
      },
    }
    expect(() => EngramSchema.parse(engram)).toThrow()
  })

  it('rejects engram without required statement', () => {
    const engram = {
      id: 'ENG-2026-0219-004',
      version: 2,
      status: 'active',
      type: 'behavioral',
      scope: 'global',
      activation: {
        retrieval_strength: 0.5,
        storage_strength: 0.5,
        frequency: 1,
        last_accessed: '2026-02-19',
      },
    }
    expect(() => EngramSchema.parse(engram)).toThrow()
  })
})

describe('PackManifestSchema', () => {
  it('validates a pack manifest parsed from SKILL.md frontmatter', () => {
    const manifest = {
      name: 'FDS Principles',
      description: 'Fair Data Society principles',
      version: '1.0.0',
      creator: 'Fair Data Society',
      license: 'cc-by-sa-4.0',
      tags: ['ethics', 'data-sovereignty'],
      'x-datacore': {
        id: 'fds-principles-v1',
        injection_policy: 'on_match',
        match_terms: ['design', 'privacy', 'data', 'consent'],
        domain: 'ethics.data-sovereignty',
        engram_count: 10,
      },
    }
    expect(() => PackManifestSchema.parse(manifest)).not.toThrow()
  })

  it('rejects pack with invalid injection_policy', () => {
    const manifest = {
      name: 'Test',
      description: 'Test',
      version: '1.0.0',
      'x-datacore': {
        id: 'test-pack',
        injection_policy: 'always',
        match_terms: [],
        engram_count: 0,
      },
    }
    expect(() => PackManifestSchema.parse(manifest)).toThrow()
  })
})
