// test/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, getConfig, resetConfigCache } from '../src/config.js'

describe('config', () => {
  const tmpDir = path.join(os.tmpdir(), 'config-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tmpDir, 'core')
    expect(config.version).toBe(2)
    expect(config.engrams.auto_promote).toBe(true)
    expect(config.packs.trusted_publishers).toEqual([])
    expect(config.search.max_results).toBe(20)
    expect(config.search.snippet_length).toBe(500)
    expect(config.hints.enabled).toBe(true)
  })

  it('parses partial YAML and fills defaults', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'version: 2\nengrams:\n  auto_promote: true\n')
    const config = loadConfig(tmpDir, 'core')
    expect(config.engrams.auto_promote).toBe(true)
    expect(config.hints.enabled).toBe(true)
    expect(config.search.snippet_length).toBe(500)
  })

  it('handles invalid YAML gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), '{{invalid yaml}}}')
    const config = loadConfig(tmpDir, 'core')
    expect(config.version).toBe(2)
    expect(config.hints.enabled).toBe(true)
  })

  it('caches config after first load', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'version: 2\nhints:\n  enabled: false\n')
    loadConfig(tmpDir, 'core')
    // Modify file — cache should still return old value
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'version: 2\nhints:\n  enabled: true\n')
    const cached = getConfig()
    expect(cached.hints.enabled).toBe(false)
  })

  it('resetConfigCache clears the cache', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'version: 2\nhints:\n  enabled: false\n')
    loadConfig(tmpDir, 'core')
    resetConfigCache()
    const fresh = getConfig()
    // After reset, getConfig returns defaults (no file loaded)
    expect(fresh.hints.enabled).toBe(true)
  })

  it('reads from .datacore/config.yaml in full mode', () => {
    const dcDir = path.join(tmpDir, '.datacore')
    fs.mkdirSync(dcDir, { recursive: true })
    fs.writeFileSync(path.join(dcDir, 'config.yaml'), 'version: 2\nsearch:\n  snippet_length: 1000\n')
    const config = loadConfig(tmpDir, 'full')
    expect(config.search.snippet_length).toBe(1000)
  })
})
