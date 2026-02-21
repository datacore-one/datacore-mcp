// test/hints.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { buildHints } from '../src/hints.js'
import { loadConfig, resetConfigCache } from '../src/config.js'

describe('hints', () => {
  const tmpDir = path.join(os.tmpdir(), 'hints-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns hints when enabled (default)', () => {
    loadConfig(tmpDir, 'core')
    const hints = buildHints({ next: 'Do something', related: ['datacore.learn'] })
    expect(hints).toEqual({ next: 'Do something', related: ['datacore.learn'] })
  })

  it('returns undefined when hints disabled in config', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'hints:\n  enabled: false\n')
    loadConfig(tmpDir, 'core')
    const hints = buildHints({ next: 'Do something', related: ['datacore.learn'] })
    expect(hints).toBeUndefined()
  })

  it('returns undefined for empty hints', () => {
    loadConfig(tmpDir, 'core')
    const hints = buildHints({})
    expect(hints).toBeUndefined()
  })

  it('includes warning in hints', () => {
    loadConfig(tmpDir, 'core')
    const hints = buildHints({ warning: 'Auto-promotion enabled' })
    expect(hints).toEqual({ warning: 'Auto-promotion enabled' })
  })
})
