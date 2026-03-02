// test/regression/session-disabled.test.ts
// Verify handleSessionStart and handleSessionEnd have no engagement field when disabled.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/index.js'
import { handleSessionStart } from '../../src/tools/session-start.js'
import { handleSessionEnd } from '../../src/tools/session-end.js'
import type { StorageConfig } from '../../src/storage.js'

describe('regression: session with engagement disabled', () => {
  const tmpDir = path.join(os.tmpdir(), 'reg-session-disabled-' + Date.now())
  let storage: StorageConfig

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(path.join(tmpDir, 'journal'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'knowledge'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'packs'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'engrams.yaml'), 'engrams: []\n')
    loadConfig(tmpDir, 'core')

    storage = {
      mode: 'core',
      basePath: tmpDir,
      engramsPath: path.join(tmpDir, 'engrams.yaml'),
      journalPath: path.join(tmpDir, 'journal'),
      knowledgePath: path.join(tmpDir, 'knowledge'),
      packsPath: path.join(tmpDir, 'packs'),
    }
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handleSessionStart returns no engagement field when disabled', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handleSessionStart(
      { task: 'test task' },
      storage,
      null,
      service,
    )

    expect(result.pending_candidates).toBeDefined()
    expect(result.recommendations).toBeDefined()
    expect(result.engagement).toBeUndefined()
  })

  it('handleSessionEnd returns no engagement field when disabled', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handleSessionEnd(
      { summary: 'Test session end' },
      storage,
      service,
    )

    expect(result.journal_path).toBeDefined()
    expect(result.engrams_created).toBe(0)
    expect(result.engagement).toBeUndefined()
  })
})
