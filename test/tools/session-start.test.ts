// test/tools/session-start.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleSessionStart } from '../../src/tools/session-start.js'
import { getPlur, resetPlur } from '../../src/plur-bridge.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import type { StorageConfig } from '../../src/storage.js'

describe('datacore.session.start (PLUR-backed)', () => {
  let tmpDir: string
  let journalDir: string
  let storage: StorageConfig

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-test-'))
    journalDir = path.join(tmpDir, 'journal')
    fs.mkdirSync(journalDir, { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'knowledge'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'packs'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'exchange', 'inbox'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'exchange', 'outbox'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'archive'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'state'), { recursive: true })

    storage = {
      mode: 'core' as const,
      basePath: tmpDir,
      engramsPath: path.join(tmpDir, 'engrams.yaml'),
      journalPath: journalDir,
      knowledgePath: path.join(tmpDir, 'knowledge'),
      spaces: [{ name: 'core', journalPath: journalDir, knowledgePath: path.join(tmpDir, 'knowledge') }],
      packsPath: path.join(tmpDir, 'packs'),
      schemasPath: path.join(tmpDir, 'schemas.yaml'),
      exchangeInboxPath: path.join(tmpDir, 'exchange', 'inbox'),
      exchangeOutboxPath: path.join(tmpDir, 'exchange', 'outbox'),
      knowledgeSurfacingPath: path.join(tmpDir, 'state', 'knowledge-surfacing.yaml'),
      archivePath: path.join(tmpDir, 'archive'),
      statePath: path.join(tmpDir, 'state'),
    }

    process.env.PLUR_PATH = tmpDir
    resetPlur()
    resetConfigCache()
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    resetPlur()
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns a session_id', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.session_id).toBeTruthy()
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('injects engrams when task is given', async () => {
    const plur = getPlur()
    plur.learn('Always validate data ownership before processing', {
      type: 'behavioral',
      tags: ['data', 'ownership'],
    })

    const result = await handleSessionStart({ task: 'design a data ownership model' }, storage)
    expect(result.engrams).not.toBeNull()
    expect(result.engrams!.count).toBeGreaterThan(0)
    expect(result.engrams!.text).toContain('validate data ownership')
  })

  it('returns null engrams when no task is given', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.engrams).toBeNull()
  })

  it('returns null journal when no entry exists today', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.journal_today).toBeNull()
  })

  it('returns journal content when today has an entry', async () => {
    const today = new Date().toLocaleDateString('en-CA')
    fs.writeFileSync(path.join(journalDir, `${today}.md`), '# Today\n\nSome notes')
    const result = await handleSessionStart({}, storage)
    expect(result.journal_today).toContain('Some notes')
  })

  it('pending_candidates is always 0 (PLUR auto-promotes)', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.pending_candidates).toBe(0)
  })

  it('shows full guide when no engrams injected', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result.guide).toContain('Quick Start')
    expect(result.guide).toContain('Session Workflow')
  })

  it('shows short guide when engrams are injected', async () => {
    const plur = getPlur()
    plur.learn('Test engram for guide check', { type: 'behavioral' })

    const result = await handleSessionStart({ task: 'test guide check' }, storage)
    expect(result.guide).toContain('Session started')
    expect(result.guide).not.toContain('Quick Start')
  })

  it('includes hints', async () => {
    const result = await handleSessionStart({}, storage)
    expect(result._hints).toBeDefined()
    expect(result._hints?.next).toContain('No task specified')
  })

  it('includes task-specific hints when task provided', async () => {
    const result = await handleSessionStart({ task: 'Write tests' }, storage)
    expect(result._hints?.next).toContain('Work on your task')
    expect(result._hints?.related).toContain('datacore.session.end')
  })
})
