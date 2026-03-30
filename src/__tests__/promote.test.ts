import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { resetPlur } from '../plur-bridge.js'
import { handlePromote } from '../tools/promote.js'

// Mock config for hints
vi.mock('../config.js', () => ({
  getConfig: () => ({
    version: 2,
    engrams: { auto_promote: true },
    packs: { trusted_publishers: [] },
    search: { max_results: 20, snippet_length: 500 },
    hints: { enabled: true },
    engagement: { enabled: false, inline_xp: false },
    injection: { directive_cap: 10, consider_cap: 5, spread_cap: 3, spread_budget: 480 },
  }),
}))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plur-promote-'))
  process.env.PLUR_PATH = tmpDir
  resetPlur()
})

afterEach(() => {
  delete process.env.PLUR_PATH
  resetPlur()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('handlePromote', () => {
  it('promotes a candidate engram to active', async () => {
    const plur = new Plur({ path: tmpDir })
    // Create engram then manually set to candidate via updateEngram
    const engram = plur.learn('Promotable engram')
    engram.status = 'candidate'
    plur.updateEngram(engram)

    const result = await handlePromote({ id: engram.id })
    expect(result.success).toBe(true)
    expect(result.promoted).toHaveLength(1)
    expect(result.promoted[0].id).toBe(engram.id)
    expect(result.errors).toHaveLength(0)

    // Verify status changed
    const fetched = plur.getById(engram.id)
    expect(fetched?.status).toBe('active')
    expect(fetched?.activation.retrieval_strength).toBe(0.7)
  })

  it('returns error for non-existent ID', async () => {
    const result = await handlePromote({ id: 'ENG-0000-0000-999' })
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toBe('Engram not found')
  })

  it('returns error for already active engram', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Already active')

    const result = await handlePromote({ id: engram.id })
    expect(result.success).toBe(false)
    expect(result.errors[0].error).toBe('Already active')
  })

  it('returns error for retired engram', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Retired engram')
    plur.forget(engram.id)

    const result = await handlePromote({ id: engram.id })
    expect(result.success).toBe(false)
    expect(result.errors[0].error).toBe('Cannot promote retired engram')
  })

  it('returns error when no IDs provided', async () => {
    const result = await handlePromote({})
    expect(result.success).toBe(false)
    expect(result.errors[0].error).toContain('At least one engram ID required')
  })

  it('handles batch promote with ids array', async () => {
    const plur = new Plur({ path: tmpDir })
    const e1 = plur.learn('Candidate one')
    const e2 = plur.learn('Candidate two')
    e1.status = 'candidate'
    e2.status = 'candidate'
    plur.updateEngram(e1)
    plur.updateEngram(e2)

    const result = await handlePromote({ ids: [e1.id, e2.id] })
    expect(result.success).toBe(true)
    expect(result.promoted).toHaveLength(2)
  })
})
