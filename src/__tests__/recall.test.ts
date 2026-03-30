import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Plur } from '@plur-ai/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { resetPlur } from '../plur-bridge.js'
import { handleRecall } from '../tools/recall.js'

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

// Mock search.ts to avoid filesystem dependency
vi.mock('../tools/search.js', () => ({
  handleSearch: vi.fn().mockResolvedValue({ results: [], method: 'keyword' }),
}))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plur-recall-'))
  process.env.PLUR_PATH = tmpDir
  resetPlur()
})

afterEach(() => {
  delete process.env.PLUR_PATH
  resetPlur()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('handleRecall', () => {
  const storage = { journalPath: '/tmp/journal', knowledgePath: '/tmp/knowledge' }

  it('returns engrams matching topic', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('TypeScript strict mode is required for all projects')
    plur.learn('Python virtual environments must be used')

    const result = await handleRecall(
      { topic: 'TypeScript strict', sources: ['engrams'] },
      storage,
    )
    expect(result.engrams).toBeDefined()
    expect(result.engrams!.length).toBeGreaterThan(0)
    expect(result.engrams![0].statement).toContain('TypeScript')
  })

  it('returns empty for no match', async () => {
    const result = await handleRecall(
      { topic: 'nonexistent_zzz_xyz_topic', sources: ['engrams'] },
      storage,
    )
    expect(result.engrams).toBeUndefined()
  })

  it('includes _hints in result', async () => {
    const result = await handleRecall(
      { topic: 'anything', sources: ['engrams'] },
      storage,
    )
    expect(result._hints).toBeDefined()
    expect(result._hints?.related).toContain('datacore.feedback')
  })

  it('respects limit parameter', async () => {
    const plur = new Plur({ path: tmpDir })
    for (let i = 0; i < 5; i++) {
      plur.learn(`Server deployment pattern number ${i}`)
    }

    const result = await handleRecall(
      { topic: 'server deployment', sources: ['engrams'], limit: 2 },
      storage,
    )
    if (result.engrams) {
      expect(result.engrams.length).toBeLessThanOrEqual(2)
    }
  })

  it('defaults to all sources', async () => {
    const plur = new Plur({ path: tmpDir })
    plur.learn('Default sources test engram')

    const result = await handleRecall({ topic: 'default sources test' }, storage)
    // Should not throw — journal/knowledge search is mocked
    expect(result._hints).toBeDefined()
  })
})
