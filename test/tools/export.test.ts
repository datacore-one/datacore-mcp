// test/tools/export.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { handleExport } from '../../src/tools/export.js'
import { resetPlur } from '../../src/plur-bridge.js'

describe('datacore.packs.export', () => {
  let tmpDir: string
  let packsPath: string
  let engramsPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'))
    packsPath = path.join(tmpDir, 'packs')
    engramsPath = path.join(tmpDir, 'engrams.yaml')
    fs.mkdirSync(packsPath, { recursive: true })
    process.env.PLUR_PATH = tmpDir
    resetPlur()
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    resetPlur()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns preview without writing when confirm is false', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('Always test before deploying', {
      tags: ['testing', 'deployment'],
      visibility: 'public',
    })

    const result = await handleExport(
      { name: 'Test Pack', description: 'A test pack' },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    expect(result.preview).toBeDefined()
    expect(result.preview!.count).toBe(1)
    expect(result.pack_path).toBeUndefined()
    expect(fs.existsSync(path.join(packsPath, 'test-pack'))).toBe(false)
  })

  it('writes pack when confirm is true', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('Always test before deploying', {
      tags: ['testing', 'deployment'],
      visibility: 'public',
    })

    const result = await handleExport(
      { name: 'Test Pack', description: 'A test pack', confirm: true },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    expect(result.pack_path).toBeDefined()
  })

  it('refuses to export private engrams', async () => {
    const plur = new Plur({ path: tmpDir })
    const engram = plur.learn('Private engram', { visibility: 'private' })

    const result = await handleExport(
      { name: 'Test Pack', description: 'A test', engram_ids: [engram.id] },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('private')
  })

  it('filters by tags', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('Testing engram', { tags: ['testing'], visibility: 'public' })
    plur.learn('Deployment engram', { tags: ['deployment'], visibility: 'public' })

    const result = await handleExport(
      { name: 'Test', description: 'Filtered', filter_tags: ['testing'] },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(true)
    expect(result.preview!.count).toBe(1)
  })

  it('returns error when no exportable engrams', async () => {
    const result = await handleExport(
      { name: 'Empty', description: 'No engrams' },
      { engramsPath, packsPath },
    )
    expect(result.success).toBe(false)
  })
})
