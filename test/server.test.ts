// test/server.test.ts
import { describe, it, expect } from 'vitest'
import { createServer, findClosestTools } from '../src/server.js'
import { TOOLS } from '../src/tools/index.js'

describe('MCP Server', () => {
  it('creates server instance', () => {
    const server = createServer()
    expect(server).toBeDefined()
  })

  it('registers all core tools', () => {
    const expectedTools = TOOLS.map(t => t.name)
    expect(expectedTools).toContain('datacore.capture')
    expect(expectedTools).toContain('datacore.search')
    expect(expectedTools).toContain('datacore.ingest')
    expect(expectedTools).toContain('datacore.status')
    expect(expectedTools).toContain('datacore.modules.list')
    expect(expectedTools).toContain('datacore.modules.info')
    expect(expectedTools).toContain('datacore.modules.health')
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
      expect(tool.name).toMatch(/^datacore\./)
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
    }
  })
})

describe('findClosestTools', () => {
  const names = TOOLS.map(t => t.name)

  it('suggests closest tool for typos', () => {
    const result = findClosestTools('datacore.captur', names)
    expect(result).toContain('datacore.capture')
  })

  it('returns empty for completely unrelated input', () => {
    const result = findClosestTools('xyz_something_totally_different_and_long', names)
    expect(result).toHaveLength(0)
  })
})
