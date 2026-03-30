// test/regression/status-disabled.test.ts
// Verify handleStatus works correctly with PLUR backend
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { handleStatus } from '../../src/tools/status.js'
import { resetPlur } from '../../src/plur-bridge.js'

describe('regression: status (engagement-independent)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-status-'))
    process.env.PLUR_PATH = tmpDir
    resetPlur()
    resetConfigCache()
    fs.mkdirSync(path.join(tmpDir, 'journal'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'knowledge'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'packs'), { recursive: true })
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    resetPlur()
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns valid status with core keys', async () => {
    const result = await handleStatus({
      engramsPath: path.join(tmpDir, 'engrams.yaml'),
      journalPath: path.join(tmpDir, 'journal'),
      knowledgePath: path.join(tmpDir, 'knowledge'),
      packsPath: path.join(tmpDir, 'packs'),
      mode: 'core',
      basePath: tmpDir,
    })

    expect(result.version).toBeDefined()
    expect(result.mode).toBe('core')
    expect(result.engrams).toBe(0)
    expect(result.packs).toBe(0)
    expect(result.journal_entries).toBe(0)
    expect(result.knowledge_notes).toBe(0)
  })
})
