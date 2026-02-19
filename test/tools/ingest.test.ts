// test/tools/ingest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleIngest } from '../../src/tools/ingest.js'

describe('datacore.ingest', () => {
  const tmpDir = path.join(os.tmpdir(), 'ingest-test-' + Date.now())
  const knowledgePath = path.join(tmpDir, 'knowledge')
  const engramsPath = path.join(tmpDir, 'engrams.yaml')

  beforeEach(() => {
    fs.mkdirSync(knowledgePath, { recursive: true })
    fs.writeFileSync(engramsPath, 'engrams: []\n')
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('ingests text as a knowledge note', async () => {
    const result = await handleIngest(
      { content: 'MCP servers use stdio transport for local communication.', title: 'MCP Transport' },
      { knowledgePath, engramsPath },
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
      { knowledgePath, engramsPath },
    )
    const content = fs.readFileSync(result.note_path!, 'utf8')
    expect(content).toContain('#test')
    expect(content).toContain('#example')
  })

  it('extracts engram suggestions from prescriptive patterns', async () => {
    const result = await handleIngest(
      { content: 'Always validate user input. Never trust external data. Prefer composition over inheritance.' },
      { knowledgePath, engramsPath },
    )
    expect(result.engram_suggestions!.length).toBeGreaterThanOrEqual(2)
  })
})
