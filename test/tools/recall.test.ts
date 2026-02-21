// test/tools/recall.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleRecall } from '../../src/tools/recall.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

describe('datacore.recall', () => {
  const tmpDir = path.join(os.tmpdir(), 'recall-test-' + Date.now())
  const journalDir = path.join(tmpDir, 'journal')
  const knowledgeDir = path.join(tmpDir, 'knowledge')
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  const storagePaths = {
    engramsPath,
    journalPath: journalDir,
    knowledgePath: knowledgeDir,
  }

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(journalDir, { recursive: true })
    fs.mkdirSync(knowledgeDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('searches engrams by keyword overlap', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: active
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Always validate input at system boundaries
    derivation_count: 1
    tags: [validation, testing]
    activation:
      retrieval_strength: 0.7
      storage_strength: 1.0
      frequency: 3
      last_accessed: "2026-02-21"
    pack: null
    abstract: null
    derived_from: null
`)
    const result = await handleRecall({ topic: 'validate input', sources: ['engrams'] }, storagePaths)
    expect(result.engrams).toBeDefined()
    expect(result.engrams!.length).toBe(1)
    expect(result.engrams![0].id).toBe('ENG-2026-0221-001')
  })

  it('excludes retired engrams', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: retired
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Always validate input
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
    const result = await handleRecall({ topic: 'validate input', sources: ['engrams'] }, storagePaths)
    expect(result.engrams).toBeUndefined()
  })

  it('searches journal files', async () => {
    fs.writeFileSync(path.join(journalDir, '2026-02-21.md'), '# 2026-02-21\n\nWorked on testing frameworks')
    const result = await handleRecall({ topic: 'testing', sources: ['journal'] }, storagePaths)
    expect(result.journal).toBeDefined()
    expect(result.journal!.length).toBeGreaterThan(0)
  })

  it('searches knowledge files', async () => {
    fs.writeFileSync(path.join(knowledgeDir, 'patterns.md'), '# Design Patterns\n\nFactory pattern for object creation')
    const result = await handleRecall({ topic: 'factory pattern', sources: ['knowledge'] }, storagePaths)
    expect(result.knowledge).toBeDefined()
    expect(result.knowledge!.length).toBeGreaterThan(0)
  })

  it('searches all sources by default', async () => {
    fs.writeFileSync(path.join(journalDir, '2026-02-21.md'), '# Testing notes\n\nUnit testing practices')
    fs.writeFileSync(path.join(knowledgeDir, 'testing.md'), '# Testing\n\nIntegration testing approach')
    const result = await handleRecall({ topic: 'testing' }, storagePaths)
    // Should have journal and/or knowledge results
    expect(result.journal || result.knowledge).toBeTruthy()
  })

  it('omits source keys with zero results', async () => {
    const result = await handleRecall({ topic: 'nonexistent topic xyz' }, storagePaths)
    expect(result.engrams).toBeUndefined()
    expect(result.journal).toBeUndefined()
    expect(result.knowledge).toBeUndefined()
  })

  it('includes hints', async () => {
    const result = await handleRecall({ topic: 'anything' }, storagePaths)
    expect(result._hints?.related).toContain('datacore.feedback')
  })
})
