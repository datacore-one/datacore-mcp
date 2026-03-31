// test/tools/status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleStatus } from '../../src/tools/status.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

describe('datacore.status', () => {
  let tmpDir: string
  let journalPath: string
  let knowledgePath: string
  let packsPath: string

  beforeEach(() => {
    resetConfigCache()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-'))
    journalPath = path.join(tmpDir, 'journal')
    knowledgePath = path.join(tmpDir, 'knowledge')
    packsPath = path.join(tmpDir, 'packs')
    fs.mkdirSync(journalPath, { recursive: true })
    fs.mkdirSync(knowledgePath, { recursive: true })
    fs.mkdirSync(packsPath, { recursive: true })
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns counts for journal and knowledge', async () => {
    fs.writeFileSync(path.join(journalPath, '2026-02-19.md'), '# Today\n')
    fs.writeFileSync(path.join(knowledgePath, 'note.md'), '# Note\n')

    const result = await handleStatus({
      journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result.journal_entries).toBe(1)
    expect(result.knowledge_notes).toBe(1)
  })

  it('recommends journal when no entry today', async () => {
    const result = await handleStatus({
      journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result._recommendations).toBeDefined()
    expect(result._recommendations!.some(r => r.includes('No journal entry today'))).toBe(true)
  })

  it('includes update recommendation when available', async () => {
    const result = await handleStatus({
      journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    }, '2.0.0')
    expect(result._recommendations!.some(r => r.includes('Update available: 2.0.0'))).toBe(true)
  })

  it('includes hints', async () => {
    const result = await handleStatus({
      journalPath, knowledgePath, packsPath,
      mode: 'core', basePath: tmpDir,
    })
    expect(result._hints).toBeDefined()
    expect(result._hints?.related).toContain('datacore.search')
  })
})
