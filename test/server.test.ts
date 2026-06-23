// test/server.test.ts
import { describe, it, expect } from 'vitest'
import { createServer, findClosestTools, canonicalToolName } from '../src/server.js'
import { TOOLS } from '../src/tools/index.js'

describe('MCP Server', () => {
  it('creates server instance', () => {
    const server = createServer()
    expect(server).toBeDefined()
  })

  it('registers all core tools', () => {
    const expectedTools = TOOLS.map(t => t.name)
    expect(expectedTools).toContain('datacore_capture')
    expect(expectedTools).toContain('datacore_search')
    expect(expectedTools).toContain('datacore_ingest')
    expect(expectedTools).toContain('datacore_status')
    expect(expectedTools).toContain('datacore_modules_list')
    expect(expectedTools).toContain('datacore_modules_info')
    expect(expectedTools).toContain('datacore_modules_health')
  })

  it('does not include removed memory tools', () => {
    const expectedTools = TOOLS.map(t => t.name)
    expect(expectedTools).not.toContain('datacore.learn')
    expect(expectedTools).not.toContain('datacore.inject')
    expect(expectedTools).not.toContain('datacore.forget')
    expect(expectedTools).not.toContain('datacore.feedback')
    expect(expectedTools).not.toContain('datacore.recall')
    expect(expectedTools).not.toContain('datacore.promote')
    expect(expectedTools).not.toContain('datacore.session.start')
    expect(expectedTools).not.toContain('datacore.session.end')
    expect(expectedTools).not.toContain('datacore.packs.discover')
    expect(expectedTools).not.toContain('datacore.packs.export')
    expect(expectedTools).not.toContain('datacore.knowledge.scan')
  })

  it('all tools have valid schemas', () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^datacore_/)
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
    }
  })

  // Regression: MCP clients (e.g. Claude Desktop) reject any tool name in
  // tools/list that does not match this pattern — dots are not allowed.
  // A single offending name blocks the whole connector. See bug report
  // "Invalid Tool Name Breaks Claude Desktop" (2026-06).
  it('every advertised tool name matches the MCP tool-name pattern', () => {
    const VALID = /^[a-zA-Z0-9_-]{1,64}$/
    for (const tool of TOOLS) {
      expect(tool.name, `tool name "${tool.name}" must match ${VALID}`).toMatch(VALID)
    }
  })
})

describe('canonicalToolName (legacy dot-name back-compat)', () => {
  it('maps legacy dot-namespaced names to the advertised underscore form', () => {
    expect(canonicalToolName('datacore.capture')).toBe('datacore_capture')
    expect(canonicalToolName('datacore.modules.list')).toBe('datacore_modules_list')
    expect(canonicalToolName('datacore.gtd.add_task')).toBe('datacore_gtd_add_task')
  })

  it('leaves already-canonical underscore names unchanged', () => {
    for (const tool of TOOLS) {
      expect(canonicalToolName(tool.name)).toBe(tool.name)
    }
  })

  it('routes every core tool from its legacy dotted alias', () => {
    for (const tool of TOOLS) {
      const legacy = tool.name.replace(/_/g, '.')
      expect(canonicalToolName(legacy)).toBe(tool.name)
    }
  })
})

describe('findClosestTools', () => {
  const names = TOOLS.map(t => t.name)

  it('suggests closest tool for typos', () => {
    const result = findClosestTools('datacore.captur', names)
    expect(result).toContain('datacore_capture')
  })

  it('returns empty for completely unrelated input', () => {
    const result = findClosestTools('xyz_something_totally_different_and_long', names)
    expect(result).toHaveLength(0)
  })
})
