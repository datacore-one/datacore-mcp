// test/tools/status.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleStatus } from '../../src/tools/status.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { resetPlur } from '../../src/plur-bridge.js'

describe('datacore.status', () => {
  let tmpDir: string
  let journalPath: string
  let knowledgePath: string
  let packsPath: string
  let engramsPath: string

  beforeEach(() => {
    resetConfigCache()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-'))
    journalPath = path.join(tmpDir, 'journal')
    knowledgePath = path.join(tmpDir, 'knowledge')
    packsPath = path.join(tmpDir, 'packs')
    engramsPath = path.join(tmpDir, 'engrams.yaml')
    fs.mkdirSync(journalPath, { recursive: true })
    fs.mkdirSync(knowledgePath, { recursive: true })
    fs.mkdirSync(packsPath, { recursive: true })
    process.env.PLUR_PATH = tmpDir
    resetPlur()
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    resetPlur()
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns counts for engrams, packs, journal, and knowledge', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('Test engram')
    fs.writeFileSync(path.join(journalPath, '2026-02-19.md'), '# Today\n')
    fs.writeFileSync(path.join(knowledgePath, 'note.md'), '# Note\n')

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
    const plur = new Plur({ path: tmpDir })
    for (let i = 0; i < 501; i++) {
      plur.learn(`Engram ${i}`)
    }

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
    expect(result._recommendations).toBeDefined()
    expect(result._recommendations!.some(r => r.includes('No journal entry today'))).toBe(true)
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
