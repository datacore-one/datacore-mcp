// test/tools/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleSearch } from '../../src/tools/search.js'
import { loadConfig, resetConfigCache } from '../../src/config.js'

describe('datacore.search', () => {
  const tmpDir = path.join(os.tmpdir(), 'search-test-' + Date.now())
  const journalPath = path.join(tmpDir, 'journal')
  const knowledgePath = path.join(tmpDir, 'knowledge')

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(journalPath, { recursive: true })
    fs.mkdirSync(knowledgePath, { recursive: true })
    fs.writeFileSync(path.join(journalPath, '2026-02-19.md'), '# 2026-02-19\n\nDiscussed MCP server architecture with team.\n')
    fs.writeFileSync(path.join(knowledgePath, 'mcp-notes.md'), '# MCP Notes\n\nMCP uses stdio transport by default.\n')
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('searches journal entries by keyword', async () => {
    const result = await handleSearch(
      { query: 'architecture', scope: 'journal' },
      { journalPath, knowledgePath },
    )
    expect(result.results).toHaveLength(1)
    expect(result.results[0].path).toContain('2026-02-19.md')
  })

  it('searches knowledge by keyword', async () => {
    const result = await handleSearch(
      { query: 'stdio', scope: 'knowledge' },
      { journalPath, knowledgePath },
    )
    expect(result.results).toHaveLength(1)
  })

  it('searches all sources when no scope specified', async () => {
    const result = await handleSearch(
      { query: 'MCP' },
      { journalPath, knowledgePath },
    )
    expect(result.results).toHaveLength(2)
  })

  it('returns empty for no matches', async () => {
    const result = await handleSearch(
      { query: 'quantum physics' },
      { journalPath, knowledgePath },
    )
    expect(result.results).toHaveLength(0)
  })

  it('extracts title from first heading', async () => {
    const result = await handleSearch(
      { query: 'stdio', scope: 'knowledge' },
      { journalPath, knowledgePath },
    )
    expect(result.results[0].title).toBe('MCP Notes')
  })

  it('extracts date from journal filename', async () => {
    const result = await handleSearch(
      { query: 'architecture', scope: 'journal' },
      { journalPath, knowledgePath },
    )
    expect(result.results[0].date).toBe('2026-02-19')
  })

  it('returns full content for small files', async () => {
    const result = await handleSearch(
      { query: 'stdio', scope: 'knowledge' },
      { journalPath, knowledgePath },
    )
    // Small file should have full content as snippet (no ... prefix)
    expect(result.results[0].snippet).toContain('# MCP Notes')
    expect(result.results[0].snippet.startsWith('...')).toBe(false)
  })

  it('uses configured snippet_length', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'search:\n  snippet_length: 20\n')
    loadConfig(tmpDir, 'core')

    // Write a file large enough to trigger snippet extraction
    const bigContent = '# Big File\n\n' + 'x'.repeat(3000) + ' architecture ' + 'y'.repeat(3000)
    fs.writeFileSync(path.join(knowledgePath, 'big.md'), bigContent)

    const result = await handleSearch(
      { query: 'architecture', scope: 'knowledge' },
      { journalPath, knowledgePath },
    )
    const bigResult = result.results.find(r => r.path.includes('big.md'))
    expect(bigResult).toBeDefined()
    // Snippet should be limited (not the full 6000+ char file)
    expect(bigResult!.snippet.length).toBeLessThan(100)
  })
})
