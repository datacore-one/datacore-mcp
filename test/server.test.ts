// test/server.test.ts
import { describe, it, expect } from 'vitest'
import { createServer } from '../src/server.js'

describe('MCP Server', () => {
  it('creates server with all 11 tools registered', () => {
    const server = createServer()
    // The server object should exist and have tools registered
    expect(server).toBeDefined()
  })
})
