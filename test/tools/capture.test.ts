// test/tools/capture.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleCapture, localDate } from '../../src/tools/capture.js'

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
      { basePath: tmpDir, mode: 'core', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
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
      { basePath: tmpDir, mode: 'core', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    const content = fs.readFileSync(path.join(tmpDir, 'journal', `${today}.md`), 'utf8')
    expect(content).toContain('Existing')
    expect(content).toContain('Second entry')
  })

  it('captures a knowledge note', async () => {
    const result = await handleCapture(
      { type: 'knowledge', content: 'MCP uses stdio by default', title: 'MCP Transport' },
      { basePath: tmpDir, mode: 'core', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    expect(result.success).toBe(true)
    expect(fs.existsSync(result.path!)).toBe(true)
  })

  it('rejects content exceeding size limit', async () => {
    const result = await handleCapture(
      { type: 'journal', content: 'x'.repeat(1_000_001) },
      { basePath: tmpDir, mode: 'core', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('too large')
  })

  it('rejects title exceeding length limit', async () => {
    const result = await handleCapture(
      { type: 'knowledge', content: 'test', title: 'a'.repeat(201) },
      { basePath: tmpDir, mode: 'core', journalPath: path.join(tmpDir, 'journal'), knowledgePath: path.join(tmpDir, 'knowledge') } as any,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('too long')
  })
})

describe('localDate', () => {
  it('returns YYYY-MM-DD date and HH:MM time', () => {
    const { date, time } = localDate()
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('uses timezone from parameter', () => {
    const { date: tokyoDate } = localDate('Asia/Tokyo')
    expect(tokyoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
