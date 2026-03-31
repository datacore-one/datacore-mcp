// test/prompts.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { registerPrompts } from '../src/prompts.js'

describe('MCP Prompts', () => {
  let handlers: Map<string, Function>

  beforeEach(() => {
    handlers = new Map()
    const server = {
      setRequestHandler: (schema: any, handler: Function) => {
        handlers.set(schema.method ?? schema.type ?? JSON.stringify(schema), handler)
      },
    } as any
    registerPrompts(server)
  })

  it('registers list and get prompt handlers', () => {
    expect(handlers.size).toBe(2)
  })

  it('lists all prompts', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    expect(result.prompts).toHaveLength(2)
    const names = result.prompts.map((p: any) => p.name)
    expect(names).toContain('datacore-capture')
    expect(names).toContain('datacore-guide')
  })

  it('prompts have descriptions and titles', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    for (const prompt of result.prompts) {
      expect(prompt.description).toBeTruthy()
      expect(prompt.title).toBeTruthy()
    }
  })

  it('datacore-guide prompt has no arguments', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    const guide = result.prompts.find((p: any) => p.name === 'datacore-guide')
    expect(guide.arguments).toBeUndefined()
  })

  describe('GetPrompt', () => {
    it('returns capture prompt', async () => {
      const getHandler = [...handlers.values()][1]
      const result = await getHandler({ params: { name: 'datacore-capture', arguments: { type: 'journal' } } })
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[0].content.text).toContain('datacore.capture')
    })

    it('returns guide prompt with tool reference', async () => {
      const getHandler = [...handlers.values()][1]
      const result = await getHandler({ params: { name: 'datacore-guide' } })
      const text = result.messages[0].content.text
      expect(result.messages[0].role).toBe('assistant')
      expect(text).toContain('capture')
      expect(text).toContain('search')
      expect(text).toContain('ingest')
      expect(text).toContain('PLUR')
    })

    it('throws for unknown prompt', async () => {
      const getHandler = [...handlers.values()][1]
      await expect(getHandler({ params: { name: 'nonexistent' } })).rejects.toThrow('Unknown prompt: nonexistent')
    })
  })
})
