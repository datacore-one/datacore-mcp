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
    expect(expectedTools).toContain('datacore.learn')
    expect(expectedTools).toContain('datacore.inject')
    expect(expectedTools).toContain('datacore.search')
    expect(expectedTools).toContain('datacore.ingest')
    expect(expectedTools).toContain('datacore.status')
    expect(expectedTools).toContain('datacore.packs.discover')
    expect(expectedTools).toContain('datacore.packs.install')
    expect(expectedTools).toContain('datacore.forget')
    expect(expectedTools).toContain('datacore.modules.list')
    expect(expectedTools).toContain('datacore.modules.info')
    expect(expectedTools).toContain('datacore.modules.health')
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
    const result = findClosestTools('datacore.lern', names)
    expect(result).toContain('datacore.learn')
  })

  it('suggests closest for partial match', () => {
    const result = findClosestTools('datacore.captur', names)
    expect(result).toContain('datacore.capture')
  })

  it('returns empty for completely unrelated input', () => {
    const result = findClosestTools('xyz_something_totally_different_and_long', names)
    expect(result).toHaveLength(0)
  })
})
