// test/tools/status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleStatus } from '../../src/tools/status.js'

describe('datacore.status', () => {
  const tmpDir = path.join(os.tmpdir(), 'status-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const journalPath = path.join(tmpDir, 'journal')
  const knowledgePath = path.join(tmpDir, 'knowledge')
  const packsPath = path.join(tmpDir, 'packs')

  beforeEach(() => {
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
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

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
})
