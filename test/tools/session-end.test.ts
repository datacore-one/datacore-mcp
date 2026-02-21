// test/tools/session-end.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleSessionEnd } from '../../src/tools/session-end.js'
import { loadEngrams } from '../../src/engrams.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import type { StorageConfig } from '../../src/storage.js'

describe('datacore.session.end', () => {
  const tmpDir = path.join(os.tmpdir(), 'session-end-test-' + Date.now())
  const journalDir = path.join(tmpDir, 'journal')
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const knowledgeDir = path.join(tmpDir, 'knowledge')
  const packsDir = path.join(tmpDir, 'packs')

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
    fs.mkdirSync(knowledgeDir, { recursive: true })
    fs.mkdirSync(packsDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('captures journal entry from summary', async () => {
    const result = await handleSessionEnd({ summary: 'Worked on tests' }, storage)
    expect(result.journal_path).toBeTruthy()
    expect(result.engrams_created).toBe(0)
    expect(fs.existsSync(result.journal_path!)).toBe(true)
  })

  it('creates engrams from suggestions', async () => {
    const result = await handleSessionEnd({
      summary: 'Session summary',
      engram_suggestions: [
        { statement: 'Always test before merge' },
        { statement: 'Use atomic writes for YAML', type: 'procedural' },
      ],
    }, storage)
    expect(result.engrams_created).toBe(2)
    const engrams = loadEngrams(engramsPath)
    expect(engrams).toHaveLength(2)
    expect(engrams[0].status).toBe('candidate')
  })

  it('creates active engrams when auto_promote is on', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'engrams:\n  auto_promote: true\n')
    loadConfig(tmpDir, 'core')

    const result = await handleSessionEnd({
      summary: 'Session summary',
      engram_suggestions: [{ statement: 'Test assertion' }],
    }, storage)
    expect(result.engrams_created).toBe(1)
    expect(result._hints?.next).toContain('active')
  })

  it('includes hints about session capture', async () => {
    const result = await handleSessionEnd({ summary: 'Done' }, storage)
    expect(result._hints?.next).toContain('Session captured')
    expect(result._hints?.related).toContain('datacore.session.start')
  })
})
