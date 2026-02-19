// test/tools/capture.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleCapture } from '../../src/tools/capture.js'

describe('datacore.capture', () => {
  const tmpDir = path.join(os.tmpdir(), 'capture-test-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'journal'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'knowledge'), { recursive: true })
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('captures a journal entry for today', async () => {
    const result = await handleCapture(
      { type: 'journal', content: 'Had a productive meeting about Datacore MCP' },
      { basePath: tmpDir, mode: 'standalone', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    expect(result.success).toBe(true)
    const today = new Date().toISOString().split('T')[0]
    const content = fs.readFileSync(path.join(tmpDir, 'journal', `${today}.md`), 'utf8')
    expect(content).toContain('productive meeting')
  })

  it('appends to existing journal entry', async () => {
    const today = new Date().toISOString().split('T')[0]
    fs.writeFileSync(path.join(tmpDir, 'journal', `${today}.md`), '# Journal\n\nExisting.\n')
    await handleCapture(
      { type: 'journal', content: 'Second entry' },
      { basePath: tmpDir, mode: 'standalone', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    const content = fs.readFileSync(path.join(tmpDir, 'journal', `${today}.md`), 'utf8')
    expect(content).toContain('Existing')
    expect(content).toContain('Second entry')
  })

  it('captures a knowledge note', async () => {
    const result = await handleCapture(
      { type: 'knowledge', content: 'MCP uses stdio by default', title: 'MCP Transport' },
      { basePath: tmpDir, mode: 'standalone', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    expect(result.success).toBe(true)
    expect(fs.existsSync(result.path!)).toBe(true)
  })
})
