// test/tools/forget.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleForget } from '../../src/tools/forget.js'
import { loadEngrams } from '../../src/engrams.js'

const tmpDir = path.join(os.tmpdir(), 'forget-test-' + Date.now())
let engramsPath: string

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true })
  engramsPath = path.join(tmpDir, 'engrams.yaml')
  fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    statement: "Always validate input"
    tags: [validation]
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-02-19"
  - id: ENG-2026-0219-002
    version: 2
    status: active
    type: procedural
    scope: global
    statement: "Check git status before operations"
    tags: [git]
    activation:
      retrieval_strength: 0.7
      storage_strength: 0.4
      frequency: 2
      last_accessed: "2026-02-19"
`)
})

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

describe('handleForget', () => {
  it('retires an engram by exact ID', async () => {
    const result = await handleForget({ id: 'ENG-2026-0219-001' }, engramsPath)
    expect(result.success).toBe(true)
    expect(result.retired?.id).toBe('ENG-2026-0219-001')

    const engrams = loadEngrams(engramsPath)
    const retired = engrams.find(e => e.id === 'ENG-2026-0219-001')
    expect(retired?.status).toBe('retired')
  })

  it('retires single match by search term', async () => {
    const result = await handleForget({ search: 'git status' }, engramsPath)
    expect(result.success).toBe(true)
    expect(result.retired?.id).toBe('ENG-2026-0219-002')
  })

  it('returns error for non-existent ID', async () => {
    const result = await handleForget({ id: 'ENG-NOPE-000' }, engramsPath)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns matches when search finds multiple', async () => {
    // Both engrams contain common words, use a broader term
    const result = await handleForget({ search: 'ENG-2026' }, engramsPath)
    expect(result.success).toBe(false)
    expect(result.matches).toHaveLength(2)
  })
})
