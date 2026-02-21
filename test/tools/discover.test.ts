// test/tools/discover.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleDiscover } from '../../src/tools/discover.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

describe('datacore.packs.discover', () => {
  const tmpDir = path.join(os.tmpdir(), 'discover-test-' + Date.now())
  const packsDir = path.join(tmpDir, 'packs')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(packsDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('lists all available packs from bundled registry', () => {
    const result = handleDiscover({}, packsDir)
    expect(result.packs.length).toBeGreaterThan(0)
  })

  it('filters by query string', () => {
    const result = handleDiscover({ query: 'ethics' }, packsDir)
    expect(result.packs.every(p =>
      p.name.toLowerCase().includes('ethics') ||
      p.description.toLowerCase().includes('ethics') ||
      p.tags.some(t => t.includes('ethics'))
    )).toBe(true)
  })

  it('filters by tag', () => {
    const result = handleDiscover({ tags: ['privacy'] }, packsDir)
    expect(result.packs.every(p => p.tags.some(t => t === 'privacy'))).toBe(true)
  })

  it('returns empty array when nothing matches', () => {
    const result = handleDiscover({ query: 'quantum physics' }, packsDir)
    expect(result.packs).toHaveLength(0)
  })

  it('marks already-installed packs', () => {
    const packDir = path.join(packsDir, 'fds-principles-v1')
    fs.mkdirSync(packDir, { recursive: true })
    fs.writeFileSync(path.join(packDir, 'SKILL.md'), '---\nname: FDS\nversion: "1.0.0"\n---\n')

    const result = handleDiscover({}, packsDir)
    const fdsPack = result.packs.find(p => p.id === 'fds-principles-v1')
    expect(fdsPack?.installed).toBe(true)
  })

  it('returns auto_installable for trusted publishers', () => {
    // Set a trusted publisher that matches a registry pack author
    const allPacks = handleDiscover({}, packsDir)
    if (allPacks.packs.length === 0) return // Skip if no registry packs

    const testAuthor = allPacks.packs[0].author
    fs.writeFileSync(
      path.join(tmpDir, 'config.yaml'),
      `packs:\n  trusted_publishers:\n    - "${testAuthor}"\n`,
    )
    loadConfig(tmpDir, 'core')

    const result = handleDiscover({}, packsDir)
    // Should have auto_installable if the pack isn't installed
    const uninstalledFromAuthor = result.packs.filter(
      p => p.author === testAuthor && !p.installed && p.can_install,
    )
    if (uninstalledFromAuthor.length > 0) {
      expect(result.auto_installable).toBeDefined()
      expect(result.auto_installable!.length).toBeGreaterThan(0)
    }
  })

  it('does not include auto_installable without trusted publishers', () => {
    const result = handleDiscover({}, packsDir)
    expect(result.auto_installable).toBeUndefined()
    expect(result.auto_upgradeable).toBeUndefined()
  })
})
