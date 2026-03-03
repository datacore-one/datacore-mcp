import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as yaml from 'js-yaml'
import {
  loadKnowledgeSurfacing,
  saveKnowledgeSurfacing,
  scanZettels,
  consolidationPass,
  type KnowledgeSurfacingState,
} from '../src/knowledge-surfacing.js'

let tmpDir: string
let statePath: string
let knowledgePath: string
let engramsPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-test-'))
  statePath = path.join(tmpDir, 'state', 'knowledge-surfacing.yaml')
  knowledgePath = path.join(tmpDir, 'knowledge')
  engramsPath = path.join(tmpDir, 'engrams.yaml')
  fs.mkdirSync(path.join(knowledgePath, 'zettel'), { recursive: true })
  fs.writeFileSync(engramsPath, 'engrams: []\n')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadKnowledgeSurfacing', () => {
  it('returns defaults when file does not exist', () => {
    const state = loadKnowledgeSurfacing(statePath)
    expect(state.last_zettel_scan).toBeNull()
    expect(state.scanned_paths).toEqual([])
    expect(state.zettel_candidates).toEqual([])
  })

  it('loads existing state', () => {
    const dir = path.dirname(statePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(statePath, yaml.dump({
      last_zettel_scan: '2026-03-01',
      scanned_paths: ['zettel/test.md'],
      zettel_candidates: [],
      last_consolidation: null,
      consolidation_results: null,
    }))
    const state = loadKnowledgeSurfacing(statePath)
    expect(state.last_zettel_scan).toBe('2026-03-01')
    expect(state.scanned_paths).toHaveLength(1)
  })
})

describe('saveKnowledgeSurfacing', () => {
  it('creates directory and writes file', () => {
    const state: KnowledgeSurfacingState = {
      last_zettel_scan: '2026-03-01',
      scanned_paths: ['a.md'],
      zettel_candidates: [],
      last_consolidation: null,
      consolidation_results: null,
    }
    saveKnowledgeSurfacing(statePath, state)
    expect(fs.existsSync(statePath)).toBe(true)
    const loaded = loadKnowledgeSurfacing(statePath)
    expect(loaded.last_zettel_scan).toBe('2026-03-01')
  })
})

describe('scanZettels', () => {
  it('detects actionable zettel as candidate', () => {
    fs.writeFileSync(
      path.join(knowledgePath, 'zettel', 'testing.md'),
      '# Testing Strategy\n\nYou should always write unit tests before integration tests.\nThis ensures faster feedback loops.',
    )
    const state = loadKnowledgeSurfacing(statePath)
    const candidates = scanZettels(knowledgePath, state)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].suggested_type).toBe('behavioral')
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(0.4)
    expect(candidates[0].status).toBe('pending')
  })

  it('skips pure factual content', () => {
    fs.writeFileSync(
      path.join(knowledgePath, 'zettel', 'definition.md'),
      '# HTTP Protocol\n\nHTTP is a protocol for transferring hypertext documents.\nIt was developed by Tim Berners-Lee.',
    )
    const state = loadKnowledgeSurfacing(statePath)
    const candidates = scanZettels(knowledgePath, state)
    expect(candidates).toHaveLength(0)
  })

  it('detects procedural content', () => {
    fs.writeFileSync(
      path.join(knowledgePath, 'zettel', 'howto.md'),
      '# How to Deploy\n\n1. Run tests\n2. Build the project\n3. Push to production\n\nYou should always verify the deployment.',
    )
    const state = loadKnowledgeSurfacing(statePath)
    const candidates = scanZettels(knowledgePath, state)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].suggested_type).toBe('procedural')
  })

  it('does not re-scan already processed paths', () => {
    fs.writeFileSync(
      path.join(knowledgePath, 'zettel', 'test.md'),
      '# Test\n\nYou should always test this.',
    )
    const state = loadKnowledgeSurfacing(statePath)
    // First scan
    const first = scanZettels(knowledgePath, state)
    expect(first).toHaveLength(1)
    // Second scan - already scanned
    const second = scanZettels(knowledgePath, state)
    expect(second).toHaveLength(0)
  })
})

describe('consolidationPass', () => {
  function writeEngrams(engrams: any[]) {
    fs.writeFileSync(engramsPath, yaml.dump({ engrams }, { lineWidth: 120 }))
  }

  it('identifies low-RS engrams', () => {
    writeEngrams([{
      id: 'ENG-2026-0301-001',
      version: 2,
      status: 'active',
      consolidated: false,
      type: 'behavioral',
      scope: 'global',
      visibility: 'private',
      statement: 'Old fading knowledge',
      derivation_count: 1,
      knowledge_anchors: [],
      associations: [],
      tags: [],
      activation: { retrieval_strength: 0.05, storage_strength: 0.3, frequency: 1, last_accessed: '2025-12-01' },
      pack: null,
      abstract: null,
      derived_from: null,
    }])
    const result = consolidationPass(engramsPath, false)
    expect(result.low_rs_engrams).toHaveLength(1)
    expect(result.action_taken).toBe('preview')
  })

  it('detects duplicate clusters', () => {
    writeEngrams([
      {
        id: 'ENG-2026-0301-001', version: 2, status: 'active', consolidated: false,
        type: 'behavioral', scope: 'global', visibility: 'private',
        statement: 'Always use TypeScript for backend services',
        derivation_count: 1, knowledge_anchors: [], associations: [], tags: [],
        activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 5, last_accessed: '2026-03-01' },
        pack: null, abstract: null, derived_from: null,
      },
      {
        id: 'ENG-2026-0301-002', version: 2, status: 'active', consolidated: false,
        type: 'behavioral', scope: 'global', visibility: 'private',
        statement: 'Always use TypeScript for backend service',  // near-duplicate
        derivation_count: 1, knowledge_anchors: [], associations: [], tags: [],
        activation: { retrieval_strength: 0.5, storage_strength: 0.8, frequency: 2, last_accessed: '2026-03-01' },
        pack: null, abstract: null, derived_from: null,
      },
    ])
    const result = consolidationPass(engramsPath, false)
    expect(result.duplicate_clusters).toHaveLength(1)
    expect(result.duplicate_clusters[0].representative).toBe('ENG-2026-0301-001')
    expect(result.duplicate_clusters[0].duplicates).toContain('ENG-2026-0301-002')
  })

  it('executes consolidation with confirm', () => {
    writeEngrams([
      {
        id: 'ENG-2026-0301-001', version: 2, status: 'active', consolidated: false,
        type: 'behavioral', scope: 'global', visibility: 'private',
        statement: 'Always use TypeScript for backend services',
        derivation_count: 1, knowledge_anchors: [], associations: [], tags: [],
        activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 5, last_accessed: '2026-03-01' },
        pack: null, abstract: null, derived_from: null,
      },
      {
        id: 'ENG-2026-0301-002', version: 2, status: 'active', consolidated: false,
        type: 'behavioral', scope: 'global', visibility: 'private',
        statement: 'Always use TypeScript for backend service',
        derivation_count: 1, knowledge_anchors: [], associations: [], tags: [],
        activation: { retrieval_strength: 0.5, storage_strength: 0.8, frequency: 2, last_accessed: '2026-03-01' },
        pack: null, abstract: null, derived_from: null,
      },
    ])
    const result = consolidationPass(engramsPath, true)
    expect(result.action_taken).toBe('executed')

    // Verify: duplicate should be retired
    const raw = yaml.load(fs.readFileSync(engramsPath, 'utf8')) as any
    const retired = raw.engrams.find((e: any) => e.id === 'ENG-2026-0301-002')
    expect(retired.status).toBe('retired')

    // Representative should have bumped derivation_count
    const rep = raw.engrams.find((e: any) => e.id === 'ENG-2026-0301-001')
    expect(rep.derivation_count).toBe(2)
  })
})
