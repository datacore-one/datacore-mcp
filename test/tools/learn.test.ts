// test/tools/learn.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleLearn } from '../../src/tools/learn.js'
import { resetPlur } from '../../src/plur-bridge.js'
import { resetConfigCache } from '../../src/config.js'

describe('datacore.learn (PLUR-backed)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-test-'))
    process.env.PLUR_PATH = tmpDir
    resetPlur()
    resetConfigCache()
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    resetPlur()
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates an engram with default type (behavioral)', async () => {
    const result = await handleLearn({ statement: 'Always validate input at system boundaries' })
    expect(result.success).toBe(true)
    expect(result.engram.statement).toBe('Always validate input at system boundaries')
    expect(result.engram.type).toBe('behavioral')
    expect(result.engram.status).toBe('active')
  })

  it('passes through type, scope, domain', async () => {
    const result = await handleLearn({
      statement: 'Use repository pattern for data access',
      type: 'architectural',
      scope: 'project:datacore',
      domain: 'software.architecture',
    })
    expect(result.engram.type).toBe('architectural')
    expect(result.engram.scope).toBe('project:datacore')
    expect(result.engram.domain).toBe('software.architecture')
  })

  it('passes through tags', async () => {
    const result = await handleLearn({
      statement: 'Tests should be deterministic',
      tags: ['testing', 'quality'],
    })
    expect(result.engram.tags).toEqual(['testing', 'quality'])
  })

  it('returns hints', async () => {
    const result = await handleLearn({ statement: 'Test hints' })
    expect(result._hints).toBeDefined()
    expect(result._hints?.next).toContain('Engram created')
    expect(result._hints?.related).toContain('datacore.inject')
  })

  it('created engram has an ENG- prefixed ID', async () => {
    const result = await handleLearn({ statement: 'ID format test' })
    expect(result.engram.id).toMatch(/^ENG-/)
  })
})
