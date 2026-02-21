// test/tools/status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleStatus } from '../../src/tools/status.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

describe('datacore.status', () => {
  const tmpDir = path.join(os.tmpdir(), 'status-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const journalPath = path.join(tmpDir, 'journal')
  const knowledgePath = path.join(tmpDir, 'knowledge')
  const packsPath = path.join(tmpDir, 'packs')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(journalPath, { recursive: true })
    fs.mkdirSync(knowledgePath, { recursive: true })
    fs.mkdirSync(packsPath, { recursive: true })
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    visibility: private
    statement: "Test engram"
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-02-19"
`)
    fs.writeFileSync(path.join(journalPath, '2026-02-19.md'), '# Today\n')
    fs.writeFileSync(path.join(knowledgePath, 'note.md'), '# Note\n')
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns counts for engrams, packs, journal, and knowledge', async () => {
    const result = await handleStatus({
      engramsPath, journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result.engrams).toBe(1)
    expect(result.journal_entries).toBe(1)
    expect(result.knowledge_notes).toBe(1)
    expect(result.packs).toBe(0)
  })

  it('includes scaling hint when engrams exceed 500', async () => {
    const engrams = Array.from({ length: 501 }, (_, i) => ({
      id: `ENG-2026-0219-${String(i).padStart(3, '0')}`,
      version: 2, status: 'active', type: 'behavioral', scope: 'global',
      visibility: 'private',
      statement: `Engram ${i}`,
      activation: { retrieval_strength: 0.5, storage_strength: 0.5, frequency: 1, last_accessed: '2026-02-19' },
    }))
    fs.writeFileSync(engramsPath, yaml.dump({ engrams }))

    const result = await handleStatus({
      engramsPath, journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result.scaling_hint).toBeTruthy()
  })

  it('recommends journal when no entry today', async () => {
    const result = await handleStatus({
      engramsPath, journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    // Unless test runs on 2026-02-19, there's no journal for today
    const today = new Date().toLocaleDateString('en-CA')
    if (today !== '2026-02-19') {
      expect(result._recommendations).toBeDefined()
      expect(result._recommendations!.some(r => r.includes('No journal entry today'))).toBe(true)
    }
  })

  it('recommends promoting candidates', async () => {
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: candidate
    type: behavioral
    scope: global
    visibility: private
    statement: "Test candidate"
    activation:
      retrieval_strength: 0.5
      storage_strength: 0.3
      frequency: 0
      last_accessed: "2026-02-19"
`)
    const result = await handleStatus({
      engramsPath, journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result._recommendations).toBeDefined()
    expect(result._recommendations!.some(r => r.includes('candidate'))).toBe(true)
  })

  it('includes update recommendation when available', async () => {
    const result = await handleStatus({
      engramsPath, journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    }, '2.0.0')
    expect(result._recommendations!.some(r => r.includes('Update available: 2.0.0'))).toBe(true)
  })

  it('includes hints', async () => {
    const result = await handleStatus({
      engramsPath, journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result._hints).toBeDefined()
    expect(result._hints?.related).toContain('datacore.promote')
  })
})
