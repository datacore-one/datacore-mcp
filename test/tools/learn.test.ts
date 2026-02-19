// test/tools/learn.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleLearn } from '../../src/tools/learn.js'
import { loadEngrams } from '../../src/engrams.js'

describe('datacore.learn', () => {
  const tmpDir = path.join(os.tmpdir(), 'learn-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('creates an engram from a statement', async () => {
    const result = await handleLearn(
      { statement: 'Always validate input at system boundaries' },
      engramsPath,
    )
    expect(result.success).toBe(true)
    expect(result.engram.id).toMatch(/^ENG-\d{4}-\d{4}-\d{3}$/)
    expect(result.engram.statement).toBe('Always validate input at system boundaries')
    expect(result.engram.status).toBe('candidate')
    expect(result.engram.visibility).toBe('private')
  })

  it('assigns optional tags, domain, and visibility', async () => {
    const result = await handleLearn(
      { statement: 'Test', tags: ['testing'], domain: 'software.testing', visibility: 'public' },
      engramsPath,
    )
    expect(result.engram.tags).toEqual(['testing'])
    expect(result.engram.domain).toBe('software.testing')
    expect(result.engram.visibility).toBe('public')
  })

  it('appends engram to existing engrams file', async () => {
    await handleLearn({ statement: 'First' }, engramsPath)
    await handleLearn({ statement: 'Second' }, engramsPath)
    const engrams = loadEngrams(engramsPath)
    expect(engrams).toHaveLength(2)
  })
})
