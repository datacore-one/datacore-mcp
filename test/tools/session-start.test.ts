// test/tools/session-start.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleSessionStart } from '../../src/tools/session-start.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import type { StorageConfig } from '../../src/storage.js'

describe('datacore.session.start', () => {
  const tmpDir = path.join(os.tmpdir(), 'session-start-test-' + Date.now())
  const journalDir = path.join(tmpDir, 'journal')
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const packsDir = path.join(tmpDir, 'packs')
  const knowledgeDir = path.join(tmpDir, 'knowledge')

  const storage: StorageConfig = {
    mode: 'core',
    basePath: tmpDir,
    engramsPath,
    journalPath: journalDir,
    knowledgePath: knowledgeDir,
    packsPath: packsDir,
  }

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(journalDir, { recursive: true })
    fs.mkdirSync(packsDir, { recursive: true })
    fs.mkdirSync(knowledgeDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null journal when no entry exists today', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.journal_today).toBeNull()
    expect(result.engrams).toBeNull()
    expect(result.pending_candidates).toBe(0)
  })

  it('returns journal content when today has an entry', async () => {
    const today = new Date().toLocaleDateString('en-CA')
    fs.writeFileSync(path.join(journalDir, `${today}.md`), '# Today\n\nSome notes')
    const result = await handleSessionStart({}, storage)
    expect(result.journal_today).toContain('Some notes')
  })

  it('counts pending candidates', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: candidate
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Test engram
    derivation_count: 1
    tags: []
    activation:
      retrieval_strength: 0.5
      storage_strength: 0.3
      frequency: 0
      last_accessed: "2026-02-21"
    pack: null
    abstract: null
    derived_from: null
`)
    const result = await handleSessionStart({}, storage)
    expect(result.pending_candidates).toBe(1)
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  it('includes no-task hint when task not provided', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result._hints?.next).toContain('No task specified')
    expect(result._hints?.related).toContain('datacore.inject')
  })

  it('includes task hint when task provided', async () => {
    const result = await handleSessionStart({ task: 'Write tests' }, storage)
    expect(result._hints?.next).toContain('Work on your task')
    expect(result._hints?.related).toContain('datacore.session.end')
  })

  it('includes full guide when no active engrams exist (fresh install)', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.guide).toContain('Quick Start')
    expect(result.guide).toContain('Session Workflow')
    expect(result.guide).toContain('Key Tools')
    expect(result.guide).toContain('How Engrams Work')
  })

  it('includes short guide when active engrams exist', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0221-001
    version: 2
    status: active
    consolidated: false
    type: behavioral
    scope: global
    visibility: private
    statement: Test active engram
    derivation_count: 1
    tags: []
    activation:
      retrieval_strength: 0.7
      storage_strength: 1.0
      frequency: 1
      last_accessed: "2026-02-21"
    pack: null
    abstract: null
    derived_from: null
`)
    const result = await handleSessionStart({}, storage)
    expect(result.guide).toContain('Session started')
    expect(result.guide).not.toContain('Quick Start')
  })
})
