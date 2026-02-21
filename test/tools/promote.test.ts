// test/tools/promote.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handlePromote } from '../../src/tools/promote.js'
import { loadEngrams } from '../../src/engrams.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

const CANDIDATE_ENGRAM = `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: candidate
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Always test first
    derivation_count: 1
    tags: [testing]
    activation:
      retrieval_strength: 0.5
      storage_strength: 0.3
      frequency: 0
      last_accessed: "2026-02-20"
    pack: null
    abstract: null
    derived_from: null
`

describe('datacore.promote', () => {
  const tmpDir = path.join(os.tmpdir(), 'promote-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(engramsPath, CANDIDATE_ENGRAM)
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('promotes a candidate to active', async () => {
    const result = await handlePromote({ id: 'ENG-2026-0221-001' }, engramsPath)
    expect(result.success).toBe(true)
    expect(result.promoted).toHaveLength(1)
    expect(result.promoted[0].id).toBe('ENG-2026-0221-001')
    expect(result.errors).toHaveLength(0)

    const engrams = loadEngrams(engramsPath)
    const promoted = engrams.find(e => e.id === 'ENG-2026-0221-001')!
    expect(promoted.status).toBe('active')
    expect(promoted.activation.retrieval_strength).toBe(0.7)
    expect(promoted.activation.storage_strength).toBe(1.0)
  })

  it('promotes multiple engrams via ids', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: candidate
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: First
    derivation_count: 1
    tags: []
    activation:
      retrieval_strength: 0.5
      storage_strength: 0.3
      frequency: 0
      last_accessed: "2026-02-20"
    pack: null
    abstract: null
    derived_from: null
  - id: ENG-2026-0221-002
    version: 2
    status: candidate
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Second
    derivation_count: 1
    tags: []
    activation:
      retrieval_strength: 0.5
      storage_strength: 0.3
      frequency: 0
      last_accessed: "2026-02-20"
    pack: null
    abstract: null
    derived_from: null
`)
    const result = await handlePromote({ ids: ['ENG-2026-0221-001', 'ENG-2026-0221-002'] }, engramsPath)
    expect(result.success).toBe(true)
    expect(result.promoted).toHaveLength(2)
  })

  it('errors on not found engram', async () => {
    const result = await handlePromote({ id: 'ENG-9999-0000-999' }, engramsPath)
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toBe('Engram not found')
  })

  it('errors on already active engram', async () => {
    // First promote it
    await handlePromote({ id: 'ENG-2026-0221-001' }, engramsPath)
    // Try again
    const result = await handlePromote({ id: 'ENG-2026-0221-001' }, engramsPath)
    expect(result.success).toBe(false)
    expect(result.errors[0].error).toBe('Already active')
  })

  it('rejects retired engram', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: retired
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Old engram
    derivation_count: 1
    tags: []
    activation:
      retrieval_strength: 0.1
      storage_strength: 0.1
      frequency: 0
      last_accessed: "2026-01-01"
    pack: null
    abstract: null
    derived_from: null
`)
    const result = await handlePromote({ id: 'ENG-2026-0221-001' }, engramsPath)
    expect(result.success).toBe(false)
    expect(result.errors[0].error).toBe('Cannot promote retired engram')
  })

  it('returns error when no IDs provided', async () => {
    const result = await handlePromote({}, engramsPath)
    expect(result.success).toBe(false)
    expect(result.errors[0].error).toContain('At least one engram ID required')
  })

  it('includes hints in result', async () => {
    const result = await handlePromote({ id: 'ENG-2026-0221-001' }, engramsPath)
    expect(result._hints?.next).toContain('Promoted')
    expect(result._hints?.related).toContain('datacore.inject')
  })
})
