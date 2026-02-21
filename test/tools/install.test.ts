// test/tools/install.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleInstall } from '../../src/tools/install.js'

describe('datacore.packs.install', () => {
  const tmpDir = path.join(os.tmpdir(), 'install-test-' + Date.now())
  const packsDir = path.join(tmpDir, 'packs')

  beforeEach(() => fs.mkdirSync(packsDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('installs a pack from a local directory', async () => {
    const srcDir = path.join(tmpDir, 'source-pack')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), '---\nname: Test\ndescription: Test\nversion: "1.0.0"\nx-datacore:\n  id: test-pack\n  injection_policy: on_match\n  match_terms: [test]\n  engram_count: 0\n---\n# Test')
    fs.writeFileSync(path.join(srcDir, 'engrams.yaml'), 'engrams: []\n')

    const result = await handleInstall({ source: srcDir }, packsDir)
    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(packsDir, 'test-pack', 'SKILL.md'))).toBe(true)
  })

  it('upgrades pack when newer version available', async () => {
    // Install v1.0.0
    const existingDir = path.join(packsDir, 'test-pack')
    fs.mkdirSync(existingDir, { recursive: true })
    fs.writeFileSync(path.join(existingDir, 'SKILL.md'), '---\nname: Test\ndescription: Test\nversion: "1.0.0"\nx-datacore:\n  id: test-pack\n  injection_policy: on_match\n  match_terms: [test]\n  engram_count: 0\n---\n# Test v1')
    fs.writeFileSync(path.join(existingDir, 'engrams.yaml'), 'engrams: []\n')

    // Install v2.0.0 over it
    const srcDir = path.join(tmpDir, 'source-pack-v2')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), '---\nname: Test\ndescription: Test\nversion: "2.0.0"\nx-datacore:\n  id: test-pack\n  injection_policy: on_match\n  match_terms: [test]\n  engram_count: 1\n---\n# Test v2')
    fs.writeFileSync(path.join(srcDir, 'engrams.yaml'), 'engrams: []\n')

    const result = await handleInstall({ source: srcDir }, packsDir)
    expect(result.success).toBe(true)
    expect(result.upgraded).toBe(true)
    const content = fs.readFileSync(path.join(packsDir, 'test-pack', 'SKILL.md'), 'utf8')
    expect(content).toContain('2.0.0')
  })

  it('skips install when same version already installed', async () => {
    const existingDir = path.join(packsDir, 'test-pack')
    fs.mkdirSync(existingDir, { recursive: true })
    fs.writeFileSync(path.join(existingDir, 'SKILL.md'), '---\nname: Test\ndescription: Test\nversion: "1.0.0"\nx-datacore:\n  id: test-pack\n  injection_policy: on_match\n  match_terms: [test]\n  engram_count: 0\n---\n# Test')

    const srcDir = path.join(tmpDir, 'source-pack')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), '---\nname: Test\ndescription: Test\nversion: "1.0.0"\nx-datacore:\n  id: test-pack\n  injection_policy: on_match\n  match_terms: [test]\n  engram_count: 0\n---\n# Test')

    const result = await handleInstall({ source: srcDir }, packsDir)
    expect(result.success).toBe(true)
    expect(result.already_current).toBe(true)
  })

  it('validates SKILL.md exists in source', async () => {
    const srcDir = path.join(tmpDir, 'bad-pack')
    fs.mkdirSync(srcDir, { recursive: true })

    const result = await handleInstall({ source: srcDir }, packsDir)
    expect(result.success).toBe(false)
  })
})
