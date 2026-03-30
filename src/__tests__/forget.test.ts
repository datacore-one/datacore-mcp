import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { resetPlur } from '../plur-bridge.js'
import { handleForget } from '../tools/forget.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plur-forget-'))
  process.env.PLUR_PATH = tmpDir
  resetPlur()
})

afterEach(() => {
  delete process.env.PLUR_PATH
  resetPlur()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('handleForget', () => {
  it('retires engram by ID', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Forget me')

    const result = await handleForget({ id: engram.id })
    expect(result.success).toBe(true)
    expect(result.retired?.id).toBe(engram.id)
    expect(result.retired?.statement).toBe('Forget me')

    // Verify it is now retired
    const fetched = plur.getById(engram.id)
    expect(fetched?.status).toBe('retired')
  })

  it('returns error for non-existent ID', async () => {
    const result = await handleForget({ id: 'ENG-0000-0000-999' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns error for already retired engram', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Already retired')
    plur.forget(engram.id)

    const result = await handleForget({ id: engram.id })
    expect(result.success).toBe(false)
    expect(result.error).toContain('already retired')
  })

  it('search with single match auto-retires', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('unique xylophone statement')

    const result = await handleForget({ search: 'xylophone' })
    expect(result.success).toBe(true)
    expect(result.retired?.id).toBe(engram.id)
  })

  it('search with multiple matches returns list', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('TypeScript pattern alpha')
    plur.learn('TypeScript pattern beta')

    const result = await handleForget({ search: 'TypeScript pattern' })
    expect(result.success).toBe(false)
    expect(result.matches).toBeDefined()
    expect(result.matches!.length).toBe(2)
    expect(result.total_matches).toBe(2)
  })

  it('search with no matches returns error', async () => {
    const result = await handleForget({ search: 'nonexistent_zzz_xyz' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('No active engrams')
  })

  it('returns error when neither id nor search provided', async () => {
    const result = await handleForget({})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Provide either')
  })
})
