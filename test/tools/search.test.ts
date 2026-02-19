// test/tools/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleSearch } from '../../src/tools/search.js'

describe('datacore.search', () => {
  const tmpDir = path.join(os.tmpdir(), 'search-test-' + Date.now())
  const journalPath = path.join(tmpDir, 'journal')
  const knowledgePath = path.join(tmpDir, 'knowledge')

  beforeEach(() => {
    fs.mkdirSync(journalPath, { recursive: true })
    fs.mkdirSync(knowledgePath, { recursive: true })
    fs.writeFileSync(path.join(journalPath, '2026-02-19.md'), '# 2026-02-19\n\nDiscussed MCP server architecture with team.\n')
    fs.writeFileSync(path.join(knowledgePath, 'mcp-notes.md'), '# MCP Notes\n\nMCP uses stdio transport by default.\n')
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

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
})
