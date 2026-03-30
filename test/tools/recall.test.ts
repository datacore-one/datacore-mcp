// test/tools/recall.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleRecall } from '../../src/tools/recall.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { resetPlur } from '../../src/plur-bridge.js'

describe('datacore.recall', () => {
  let tmpDir: string
  let journalDir: string
  let knowledgeDir: string

  beforeEach(() => {
    resetConfigCache()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-test-'))
    journalDir = path.join(tmpDir, 'journal')
    knowledgeDir = path.join(tmpDir, 'knowledge')
    fs.mkdirSync(journalDir, { recursive: true })
    fs.mkdirSync(knowledgeDir, { recursive: true })
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

  const storagePaths = () => ({
    journalPath: journalDir,
    knowledgePath: knowledgeDir,
  })

  it('searches engrams by keyword overlap', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('Always validate input at system boundaries', {
      tags: ['validation', 'testing'],
    })

    const result = await handleRecall({ topic: 'validate input', sources: ['engrams'] }, storagePaths())
    expect(result.engrams).toBeDefined()
    expect(result.engrams!.length).toBe(1)
  })

  it('excludes retired engrams', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Always validate input')
    plur.forget(engram.id)

    const result = await handleRecall({ topic: 'validate input', sources: ['engrams'] }, storagePaths())
    expect(result.engrams).toBeUndefined()
  })

  it('searches journal files', async () => {
    fs.writeFileSync(path.join(journalDir, '2026-02-21.md'), '# 2026-02-21\n\nWorked on testing frameworks')
    const result = await handleRecall({ topic: 'testing', sources: ['journal'] }, storagePaths())
    expect(result.journal).toBeDefined()
    expect(result.journal!.length).toBeGreaterThan(0)
  })

  it('searches knowledge files', async () => {
    fs.writeFileSync(path.join(knowledgeDir, 'patterns.md'), '# Design Patterns\n\nFactory pattern for object creation')
    const result = await handleRecall({ topic: 'factory pattern', sources: ['knowledge'] }, storagePaths())
    expect(result.knowledge).toBeDefined()
    expect(result.knowledge!.length).toBeGreaterThan(0)
  })

  it('searches all sources by default', async () => {
    fs.writeFileSync(path.join(journalDir, '2026-02-21.md'), '# Testing notes\n\nUnit testing practices')
    fs.writeFileSync(path.join(knowledgeDir, 'testing.md'), '# Testing\n\nIntegration testing approach')
    const result = await handleRecall({ topic: 'testing' }, storagePaths())
    expect(result.journal || result.knowledge).toBeTruthy()
  })

  it('omits source keys with zero results', async () => {
    const result = await handleRecall({ topic: 'nonexistent topic xyz' }, storagePaths())
    expect(result.engrams).toBeUndefined()
    expect(result.journal).toBeUndefined()
    expect(result.knowledge).toBeUndefined()
  })

  it('includes hints', async () => {
    const result = await handleRecall({ topic: 'anything' }, storagePaths())
    expect(result._hints?.related).toContain('datacore.feedback')
  })
})
