// test/tools/ingest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleIngest } from '../../src/tools/ingest.js'

describe('datacore.ingest', () => {
  let tmpDir: string
  let knowledgePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-test-'))
    knowledgePath = path.join(tmpDir, 'knowledge')
    fs.mkdirSync(knowledgePath, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('ingests text as a knowledge note', async () => {
    const result = await handleIngest(
      { content: 'MCP servers use stdio transport for local communication.', title: 'MCP Transport' },
      { knowledgePath },
    )
    expect(result.success).toBe(true)
    expect(result.note_path).toBeTruthy()
    expect(fs.existsSync(result.note_path!)).toBe(true)
    const content = fs.readFileSync(result.note_path!, 'utf8')
    expect(content).toContain('MCP servers use stdio')
  })

  it('ingests with tags', async () => {
    const result = await handleIngest(
      { content: 'Test content', title: 'Tagged Note', tags: ['test', 'example'] },
      { knowledgePath },
    )
    const content = fs.readFileSync(result.note_path!, 'utf8')
    expect(content).toContain('#test')
    expect(content).toContain('#example')
  })

  it('returns hint about plur_ingest', async () => {
    const result = await handleIngest(
      { content: 'Always validate user input. Never trust external data.' },
      { knowledgePath },
    )
    expect(result.success).toBe(true)
    expect(result._hints?.next).toContain('plur_ingest')
  })
})
