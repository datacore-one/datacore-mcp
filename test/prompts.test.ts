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
    expect(result.prompts).toHaveLength(3)
    const names = result.prompts.map((p: any) => p.name)
    expect(names).toContain('datacore-session')
    expect(names).toContain('datacore-learn')
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

  it('datacore-session prompt has optional task argument', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    const session = result.prompts.find((p: any) => p.name === 'datacore-session')
    expect(session.arguments).toHaveLength(1)
    expect(session.arguments[0].name).toBe('task')
    expect(session.arguments[0].required).toBe(false)
  })

  it('datacore-learn prompt has required statement argument', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    const learn = result.prompts.find((p: any) => p.name === 'datacore-learn')
    expect(learn.arguments).toHaveLength(1)
    expect(learn.arguments[0].name).toBe('statement')
    expect(learn.arguments[0].required).toBe(true)
  })

  it('datacore-guide prompt has no arguments', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    const guide = result.prompts.find((p: any) => p.name === 'datacore-guide')
    expect(guide.arguments).toBeUndefined()
  })

  describe('GetPrompt', () => {
    it('returns session prompt with task', async () => {
      const getHandler = [...handlers.values()][1]
      const result = await getHandler({ params: { name: 'datacore-session', arguments: { task: 'fix the login bug' } } })
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[0].content.text).toContain('fix the login bug')
      expect(result.messages[0].content.text).toContain('datacore.session.start')
    })

    it('returns session prompt without task', async () => {
      const getHandler = [...handlers.values()][1]
      const result = await getHandler({ params: { name: 'datacore-session' } })
      expect(result.messages[0].content.text).toContain('datacore.session.start')
      expect(result.messages[0].content.text).not.toContain('Task:')
    })

    it('returns learn prompt with statement', async () => {
      const getHandler = [...handlers.values()][1]
      const result = await getHandler({ params: { name: 'datacore-learn', arguments: { statement: 'Always test first' } } })
      expect(result.messages[0].content.text).toContain('Always test first')
      expect(result.messages[0].content.text).toContain('datacore.learn')
      expect(result.messages[0].content.text).toContain('candidate')
    })

    it('returns guide prompt with full reference', async () => {
      const getHandler = [...handlers.values()][1]
      const result = await getHandler({ params: { name: 'datacore-guide' } })
      const text = result.messages[0].content.text
      expect(result.messages[0].role).toBe('assistant')
      expect(text).toContain('Session Workflow')
      expect(text).toContain('Tool Reference')
      expect(text).toContain('Engram Lifecycle')
      expect(text).toContain('session.start')
      expect(text).toContain('session.end')
      expect(text).toContain('feedback')
      expect(text).toContain('promote')
    })

    it('throws for unknown prompt', async () => {
      const getHandler = [...handlers.values()][1]
      await expect(getHandler({ params: { name: 'nonexistent' } })).rejects.toThrow('Unknown prompt: nonexistent')
    })
  })
})
