// test/tools/session-end.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleSessionEnd } from '../../src/tools/session-end.js'
import { getPlur, resetPlur } from '../../src/plur-bridge.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import type { StorageConfig } from '../../src/storage.js'

describe('datacore.session.end (PLUR-backed)', () => {
  let tmpDir: string
  let journalDir: string
  let storage: StorageConfig

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-end-test-'))
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

  it('captures journal entry from summary', async () => {
    const result = await handleSessionEnd({ summary: 'Worked on tests' }, storage)
    expect(result.journal_path).toBeTruthy()
    expect(result.engrams_created).toBe(0)
    expect(fs.existsSync(result.journal_path!)).toBe(true)
  })

  it('creates engrams from suggestions via PLUR', async () => {
    const result = await handleSessionEnd({
      summary: 'Session summary',
      engram_suggestions: [
        { statement: 'Always test before merge' },
        { statement: 'Use atomic writes for YAML', type: 'procedural' },
      ],
    }, storage)
    expect(result.engrams_created).toBe(2)

    // Verify engrams exist in PLUR store
    const plur = getPlur()
    const all = plur.list()
    expect(all.length).toBeGreaterThanOrEqual(2)
    expect(all.some(e => e.statement === 'Always test before merge')).toBe(true)
    expect(all.some(e => e.statement === 'Use atomic writes for YAML')).toBe(true)
  })

  it('returns journal_path', async () => {
    const result = await handleSessionEnd({ summary: 'Done for today' }, storage)
    expect(result.journal_path).toBeTruthy()
    expect(result.journal_path!).toContain('journal')
    const content = fs.readFileSync(result.journal_path!, 'utf8')
    expect(content).toContain('Done for today')
  })

  it('works with no suggestions', async () => {
    const result = await handleSessionEnd({ summary: 'Quick session' }, storage)
    expect(result.engrams_created).toBe(0)
    expect(result.journal_path).toBeTruthy()
  })

  it('includes hints about session capture', async () => {
    const result = await handleSessionEnd({ summary: 'Done' }, storage)
    expect(result._hints?.next).toContain('Session captured')
    expect(result._hints?.related).toContain('datacore.session.start')
  })

  it('includes engram count in hints when suggestions created', async () => {
    const result = await handleSessionEnd({
      summary: 'Session with learnings',
      engram_suggestions: [{ statement: 'Test hint content' }],
    }, storage)
    expect(result._hints?.next).toContain('1 engram(s) created')
  })
})
