// test/tools/learn.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleLearn, generateEngramId } from '../../src/tools/learn.js'
import { loadEngrams } from '../../src/engrams.js'
import type { Engram } from '../../src/schemas/engram.js'

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
    expect(result.engram.id).toMatch(/^ENG-\d{4}-\d{4}-\d{3,}$/)
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

describe('generateEngramId', () => {
  it('increments from existing engrams for the same day', () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(0, 8)
    const prefix = `ENG-${today.slice(0, 4)}-${today.slice(4)}-`
    const existing = [
      { id: `${prefix}001` },
      { id: `${prefix}003` },
    ] as Engram[]
    const newId = generateEngramId(existing)
    expect(newId).toBe(`${prefix}004`)
  })

  it('starts at 001 when no existing engrams for today', () => {
    const id = generateEngramId([])
    expect(id).toMatch(/^ENG-\d{4}-\d{4}-001$/)
  })

  it('rolls to 4+ digits past 999', () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(0, 8)
    const prefix = `ENG-${today.slice(0, 4)}-${today.slice(4)}-`
    const existing = [{ id: `${prefix}999` }] as Engram[]
    const newId = generateEngramId(existing)
    expect(newId).toBe(`${prefix}1000`)
  })
})
