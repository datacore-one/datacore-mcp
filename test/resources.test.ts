// test/resources.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { registerResources } from '../src/resources.js'
import type { StorageConfig } from '../src/storage.js'

describe('MCP Resources', () => {
  const tmpDir = path.join(os.tmpdir(), 'resources-test-' + Date.now())
  let storage: StorageConfig
  let server: Server
  let handlers: Map<string, Function>

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'journal'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'knowledge'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'packs'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'engrams.yaml'), 'engrams:\n  - id: ENG-2026-0101-001\n    version: 1\n    statement: Test engram\n    type: behavioral\n    scope: global\n    tags: [test]\n    domain: testing\n    status: active\n    visibility: private\n    activation:\n      retrieval_strength: 0.8\n      storage_strength: 1.0\n      frequency: 1\n      last_accessed: "2026-01-01"\n    source_patterns: []\n    feedback_signals:\n      positive: 0\n      negative: 0\n')

    storage = {
      mode: 'standalone',
      basePath: tmpDir,
      engramsPath: path.join(tmpDir, 'engrams.yaml'),
      journalPath: path.join(tmpDir, 'journal'),
      knowledgePath: path.join(tmpDir, 'knowledge'),
      packsPath: path.join(tmpDir, 'packs'),
    }

    handlers = new Map()
    server = {
      setRequestHandler: (schema: any, handler: Function) => {
        handlers.set(schema.method ?? schema.type ?? JSON.stringify(schema), handler)
      },
    } as any

    registerResources(server, storage)
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('registers list resources handler', () => {
    expect(handlers.size).toBeGreaterThanOrEqual(2)
  })

  it('lists static resources', async () => {
    const listHandler = [...handlers.values()][0]
    const result = await listHandler()
    expect(result.resources).toHaveLength(3)
    expect(result.resources.map((r: any) => r.uri)).toContain('datacore://status')
    expect(result.resources.map((r: any) => r.uri)).toContain('datacore://engrams/active')
    expect(result.resources.map((r: any) => r.uri)).toContain('datacore://journal/today')
  })

  it('lists resource templates', async () => {
    const templatesHandler = [...handlers.values()][1]
    const result = await templatesHandler()
    expect(result.resourceTemplates).toHaveLength(2)
  })

  it('reads status resource', async () => {
    const readHandler = [...handlers.values()][2]
    const result = await readHandler({ params: { uri: 'datacore://status' } })
    const data = JSON.parse(result.contents[0].text)
    expect(data.mode).toBe('standalone')
    expect(data.engrams).toBe(1)
  })

  it('reads active engrams resource', async () => {
    const readHandler = [...handlers.values()][2]
    const result = await readHandler({ params: { uri: 'datacore://engrams/active' } })
    const engrams = JSON.parse(result.contents[0].text)
    expect(engrams).toHaveLength(1)
    expect(engrams[0].id).toBe('ENG-2026-0101-001')
  })

  it('reads journal entry by date', async () => {
    fs.writeFileSync(path.join(tmpDir, 'journal', '2026-01-15.md'), '# Entry\nHello world')
    const readHandler = [...handlers.values()][2]
    const result = await readHandler({ params: { uri: 'datacore://journal/2026-01-15' } })
    expect(result.contents[0].text).toContain('Hello world')
  })
})
