// test/regression/learn-disabled.test.ts
// Verify handleLearn response is unchanged when engagement is disabled.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/index.js'
import { handleLearn } from '../../src/tools/learn.js'

describe('regression: learn with engagement disabled', () => {
  const tmpDir = path.join(os.tmpdir(), 'reg-learn-disabled-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns same structure with no xp field when engagement disabled', async () => {
    const service = new EngagementService(tmpDir, { enabled: false, inline_xp: false })

    const result = await handleLearn(
      { statement: 'Test regression learn' },
      engramsPath,
      service,
    )

    expect(result.success).toBe(true)
    expect(result.engram).toBeDefined()
    expect(result.engram.statement).toBe('Test regression learn')
    expect(result.engram.id).toMatch(/^ENG-/)
    // xp should be undefined when engagement is disabled (service.isEnabled() = false)
    expect(result.xp).toBeUndefined()
  })

  it('returns same structure when no service passed at all', async () => {
    const result = await handleLearn(
      { statement: 'Test no service' },
      engramsPath,
    )

    expect(result.success).toBe(true)
    expect(result.engram).toBeDefined()
    expect(result.xp).toBeUndefined()
  })
})
