// test/config-engagement.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../src/config.js'

describe('engagement config parsing', () => {
  const tmpDir = path.join(os.tmpdir(), 'config-engagement-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('defaults engagement to enabled with inline_xp false', () => {
    const config = loadConfig(tmpDir, 'core')
    expect(config.engagement.enabled).toBe(true)
    expect(config.engagement.inline_xp).toBe(false)
  })

  it('parses engagement section when present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.yaml'),
      'version: 2\nengagement:\n  enabled: true\n  inline_xp: true\n',
    )
    const config = loadConfig(tmpDir, 'core')
    expect(config.engagement.enabled).toBe(true)
    expect(config.engagement.inline_xp).toBe(true)
  })

  it('parses engagement disabled', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.yaml'),
      'version: 2\nengagement:\n  enabled: false\n',
    )
    const config = loadConfig(tmpDir, 'core')
    expect(config.engagement.enabled).toBe(false)
    expect(config.engagement.inline_xp).toBe(false) // default
  })

  it('fills defaults when engagement section is empty object', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.yaml'),
      'version: 2\nengagement: {}\n',
    )
    const config = loadConfig(tmpDir, 'core')
    expect(config.engagement.enabled).toBe(true)
    expect(config.engagement.inline_xp).toBe(false)
  })

  it('fills engagement defaults when section is absent', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.yaml'),
      'version: 2\nhints:\n  enabled: false\n',
    )
    const config = loadConfig(tmpDir, 'core')
    expect(config.engagement.enabled).toBe(true)
    expect(config.engagement.inline_xp).toBe(false)
  })

  it('reads engagement from .datacore/config.yaml in full mode', () => {
    const dcDir = path.join(tmpDir, '.datacore')
    fs.mkdirSync(dcDir, { recursive: true })
    fs.writeFileSync(
      path.join(dcDir, 'config.yaml'),
      'version: 2\nengagement:\n  enabled: false\n  inline_xp: true\n',
    )
    const config = loadConfig(tmpDir, 'full')
    expect(config.engagement.enabled).toBe(false)
    expect(config.engagement.inline_xp).toBe(true)
  })
})
